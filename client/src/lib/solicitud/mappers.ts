/**
 * mappers.ts — Transforma la `SolicitudData` extraída del PDF en los
 * payloads que aceptan los endpoints existentes del backend.
 *
 * Tres funciones puras:
 *   • solicitudToClientPayload(s)    → POST /api/clients
 *   • solicitudToContractPayload(s)  → POST /api/contracts (requiere clientId)
 *   • solicitudToAvalesPayloads(s)   → POST /api/expediente/actores (uno por obligado)
 *
 * Cálculos financieros:
 *   La solicitud trae valorConIVA y plazoMeses. Para el contrato
 *   necesitamos: valorBien (sin IVA), rentaMensual, rentaMensualIVA,
 *   montoFinanciar, depositoGarantia, comisionApertura. Reusamos
 *   calcularCotizacion() del motor de cliente
 *   (lib/cotizacion/calculos.ts) — está validado al centavo contra el
 *   Excel de Inyecta (CLAUDE.md §4). Así, al crear el contrato
 *   desde una solicitud, los montos cuadran con el cotizador.
 *
 * Mapeos de enums: el backend del contrato espera strings exactos
 * para montoMensualRango/frecuencia/numOperacionesRango. Como el
 * PDF solo trae un NÚMERO y una operación aproximada, derivamos los
 * rangos de CNBV a partir de rangos numéricos típicos.
 */
import { calcularCotizacion } from '../cotizacion/calculos';
import type { SolicitudData, TipoObligado } from './types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
/** Remueve null/undefined y strings vacíos. Mantiene 0 y false. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * CNBV-like ranges esperados por el backend (inferido del schema
 * PerfilTransaccional). Valores:
 *   MontoRango:      MENOS_10K | ENTRE_10K_50K | ENTRE_50K_100K | MAS_100K
 *   FrecuenciaTrans: DIARIO | SEMANAL | QUINCENAL | MENSUAL | TRIMESTRAL | ANUAL
 *   NumOpsRango:     UNO_A_TREINTA | TREINTA_A_CIEN | MAS_CIEN
 *
 * La solicitud trae números, derivamos el rango más cercano. Si el
 * backend rechaza uno de estos valores, el usuario lo corrige en la
 * UI antes de crear.
 */
function montoMensualARango(n?: number | null): string | undefined {
  if (n === null || n === undefined) return undefined;
  if (n < 10000)  return 'MENOS_10K';
  if (n < 50000)  return 'ENTRE_10K_50K';
  if (n < 100000) return 'ENTRE_50K_100K';
  return 'MAS_100K';
}
function numOperacionesARango(n?: number | null): string | undefined {
  if (n === null || n === undefined) return undefined;
  if (n <= 30)   return 'UNO_A_TREINTA';
  if (n <= 100)  return 'TREINTA_A_CIEN';
  return 'MAS_CIEN';
}

/** Estado civil → enum del backend. Tolera variantes libres. */
function estadoCivilEnum(v?: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toUpperCase();
  if (/CASAD/.test(s)) return 'CASADO';
  if (/SOLTER/.test(s)) return 'SOLTERO';
  if (/DIVORC/.test(s)) return 'DIVORCIADO';
  if (/VIUD/.test(s)) return 'VIUDO';
  if (/CONCUB/.test(s) || /UNION/.test(s)) return 'UNION_LIBRE';
  return undefined;
}

/** Régimen matrimonial → enum del backend. */
function regimenMatrimonialEnum(v?: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toUpperCase();
  if (/SOCIEDAD/.test(s)) return 'SOCIEDAD_CONYUGAL';
  if (/SEPARAC/.test(s)) return 'SEPARACION_DE_BIENES';
  return undefined;
}

/** sexo/género → enum Genero del backend. */
function generoEnum(v?: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toUpperCase();
  if (s === 'H' || /MASC/.test(s) || /HOMBR/.test(s)) return 'MASCULINO';
  if (s === 'M' || /FEM/.test(s) || /MUJER/.test(s)) return 'FEMENINO';
  return undefined;
}

// ─────────────────────────────────────────────────────────────
// Mapper 1: Cliente
// ─────────────────────────────────────────────────────────────
export function solicitudToClientPayload(s: SolicitudData): Record<string, unknown> {
  const tipo = s.tipoSolicitante;
  if (tipo !== 'PFAE' && tipo !== 'PM') {
    throw new Error('La solicitud no indica si el solicitante es PFAE o PM.');
  }

  const base: Record<string, unknown> = { tipo, pais: 'México' };

  if (tipo === 'PFAE') {
    const p = s.solicitantePFAE ?? {};
    Object.assign(base, clean({
      nombre: p.nombre,
      apellidoPaterno: p.apellidoPaterno,
      apellidoMaterno: p.apellidoMaterno,
      curp: p.curp,
      rfc: p.rfc,
      email: p.email,
      telefono: p.telefono,
      telefonoOficina: p.celular,                 // celular va a telefonoOficina
      actividadEconomica: p.actividad ?? p.giro,
      sector: p.giro,
      anosAntiguedadActividad: parseAntiguedadAnios(p.antiguedadNegocio),
      // Domicilio fiscal
      calle: p.calle,
      numExterior: p.numExterior,
      numInterior: p.numInterior,
      colonia: p.colonia,
      municipio: p.municipio,
      ciudad: p.ciudad,
      estado: p.estado,
      cp: p.codigoPostal,
      pais: p.pais ?? 'México',
    }));
  } else {
    const p = s.solicitantePM ?? {};
    Object.assign(base, clean({
      razonSocial: p.razonSocial,
      rfc: p.rfc,
      email: p.email,
      telefono: p.telefono,
      fechaConstitucion: p.fechaConstitucion,
      capitalSocial: p.capitalSocial,
      sector: p.sector ?? p.giro,
      actividadEconomica: p.actividad ?? p.giro,
      // Domicilio fiscal
      calle: p.calle,
      numExterior: p.numExterior,
      numInterior: p.numInterior,
      colonia: p.colonia,
      municipio: p.municipio,
      ciudad: p.ciudad,
      estado: p.estado,
      cp: p.codigoPostal,
      pais: p.pais ?? 'México',
    }));

    // Representante legal (nested 1:1)
    const rl = s.representanteLegal;
    if (rl?.nombre || rl?.apellidoPaterno) {
      base.representanteLegal = clean({
        nombre: rl.nombre,
        apellidoPaterno: rl.apellidoPaterno,
        apellidoMaterno: rl.apellidoMaterno,
        rfc: rl.rfc,
        curp: rl.curp,
        ocupacion: rl.cargo,
        fechaInscripcionPoderes: rl.fechaEscrituraPoder,
        folioInscripcionPoderes: rl.numeroEscrituraPoder,
      });
    }

    // Socios (nested 1:N)
    // Si hay obligados solidarios en la solicitud que NO son AVAL sino
    // accionistas, deberían venir en otra sección; por simplicidad
    // mapeamos a Shareholder solo el representante legal si viene
    // marcado, para cumplir la validación del backend (PM requiere
    // al menos 1 socio con esRepLegal=true). El usuario puede agregar
    // más en la UI antes de crear.
    const socios: Record<string, unknown>[] = [];
    if (rl?.nombre && rl?.apellidoPaterno) {
      socios.push(clean({
        nombre: rl.nombre,
        apellidoPaterno: rl.apellidoPaterno,
        apellidoMaterno: rl.apellidoMaterno,
        rfc: rl.rfc,
        curp: rl.curp,
        porcentaje: 100,                 // placeholder: el usuario lo edita
        esRepLegal: true,
      }));
    }
    if (socios.length > 0) base.socios = socios;
  }

  return base;
}

function parseAntiguedadAnios(s?: string | null): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

// ─────────────────────────────────────────────────────────────
// Mapper 2: Contrato (con cálculos financieros)
// ─────────────────────────────────────────────────────────────
export interface ContractPayloadInput {
  clientId: string;
}

export function solicitudToContractPayload(
  s: SolicitudData,
  { clientId }: ContractPayloadInput,
): Record<string, unknown> {
  const bien = s.bien ?? {};
  const op = s.operacion ?? {};

  if (!bien.descripcion) {
    throw new Error('La solicitud no trae la descripción del bien arrendado.');
  }
  if (!bien.valorConIVA || bien.valorConIVA <= 0) {
    throw new Error('La solicitud no trae el valor del bien con IVA.');
  }
  if (!op.plazoMeses || op.plazoMeses < 12 || op.plazoMeses > 48) {
    throw new Error('El plazo debe estar entre 12 y 48 meses (la solicitud trae: ' + String(op.plazoMeses) + ').');
  }
  const producto = op.tipoArrendamiento ?? 'FINANCIERO';

  // Motor compartido con el cotizador: valida al centavo contra Excel.
  // Ver client/src/lib/cotizacion/calculos.ts — la firma completa requiere
  // todos los parámetros. Usamos los defaults estándar de Inyecta
  // (CLAUDE.md §4). El usuario luego puede ajustar en el detalle del
  // contrato.
  const porcentajeResidual = producto === 'PURO' ? 0.16 : 0.02;
  const calc = calcularCotizacion({
    valorBienConIVA: bien.valorConIVA,
    tasaIVA: 0.16,
    producto,
    plazo: op.plazoMeses,
    tasaAnual: 0.36,
    tasaComisionApertura: 0.05,
    comisionAperturaEsContado: false,
    porcentajeResidual,
    gpsMonto: 0,                     // no se conoce desde la solicitud
    gpsEsContado: false,
    seguroMonto: 0,
    seguroEsContado: false,
    engancheMonto: 0,
    engancheEsContado: false,
    nombreBien: bien.descripcion ?? '',
    estadoBien: bien.nuevo === false ? 'Seminuevo' : 'Nuevo',
    seguroEstado: 'Pendiente',
    nombreCliente: '',
    fecha: new Date(),
  });

  // calcPMT clásico para obtener la renta neta (el motor solo devuelve
  // rentaMensual.montoNeto/iva/total en numeros). Tomamos directo:
  const rentaNeta = calc.rentaMensual.montoNeto;
  const rentaIVA  = calc.rentaMensual.iva;

  const payload: Record<string, unknown> = {
    clientId,
    producto,
    plazo: op.plazoMeses,
    tasaAnual: 0.36,
    nivelRiesgo: 'A',
    // Bien (flat columns)
    bienDescripcion: bien.descripcion,
    bienMarca: bien.marca ?? undefined,
    bienModelo: bien.modelo ?? undefined,
    bienAnio: bien.anio ?? undefined,
    bienNumSerie: bien.numSerie ?? undefined,
    bienEstado: bien.nuevo === true ? 'Nuevo' : bien.nuevo === false ? 'Usado' : undefined,
    // Financieros (del motor, números listos para JSON)
    valorBien: calc.valorBienSinIVA,
    montoFinanciar: calc.montoFinanciadoReal,
    rentaMensual: rentaNeta,
    rentaMensualIVA: rentaIVA,
    depositoGarantia: calc.pagoInicial.depositoGarantia,
    comisionApertura: calc.monto.comisionAperturaFinanciada,
    valorResidual: calc.residual.monto,
    gpsInstalacion: 0,
    // KYC
    destinoArrendamiento: op.destino ?? undefined,
    fechaSolicitud: new Date().toISOString().slice(0, 10),
  };

  // Proveedor (1:1 anidado)
  if (bien.proveedor) {
    payload.proveedor = clean({
      nombre: bien.proveedor,
      // el campo rfcProveedor del schema del backend no existe;
      // guardamos lo que sí aceptan.
    });
  }

  // Perfil transaccional (1:1 anidado)
  const pt = s.perfilTransaccional;
  if (pt) {
    const perfil = clean({
      productosQueAdquirira: bien.descripcion,
      origenRecursos: pt.origenRecursos,
      destinoRecursos: pt.destinoRecursos,
      montoMensualRango: montoMensualARango(pt.montoMensualOperaciones),
      frecuencia: 'MENSUAL',
      numOperacionesRango: numOperacionesARango(pt.numeroOperacionesMensuales),
      realizaPagosEfectivo: false,
    });
    if (Object.keys(perfil).length > 0) payload.perfilTransaccional = perfil;
  }

  // PEP (array anidado — al menos SOLICITANTE)
  const pepDecl: Array<Record<string, unknown>> = [];
  if (s.pep) {
    pepDecl.push(clean({
      tipo: 'SOLICITANTE',
      esPep: s.pep.esPEP ?? false,
      dependencia: s.pep.cargoPEP,
      puesto: s.pep.cargoPEP,
      periodoEjercicio: s.pep.periodoPEP,
    }));
    if (s.pep.familiarPEP) {
      pepDecl.push(clean({
        tipo: 'PARIENTE',
        esPep: true,
        nombre: s.pep.nombreFamiliarPEP,
        parentesco: s.pep.parentescoPEP,
        puesto: s.pep.cargoFamiliarPEP,
      }));
    }
  }
  if (pepDecl.length > 0) payload.declaracionesPEP = pepDecl;

  return payload;
}

// ─────────────────────────────────────────────────────────────
// Mapper 3: Avales (obligados solidarios) post-contrato
// ─────────────────────────────────────────────────────────────
/**
 * Para cada obligado solidario de la solicitud, arma el payload de
 * POST /api/expediente/actores?contractId=<id> para crear el actor
 * de tipo AVAL. El subtipo PF/PM depende del campo `tipo` del obligado
 * (PFAE y PF se mapean a PF; PM a PM).
 */
export interface AvalActorPayload {
  contractId: string;
  tipo: 'AVAL';
  subtipo: 'PF' | 'PM';
  orden: number;
  nombre: string;
  rfc?: string;
  datosAdicionales?: Record<string, unknown>;
}

export function solicitudToAvalesPayloads(
  s: SolicitudData,
  contractId: string,
): AvalActorPayload[] {
  const obligados = s.obligadosSolidarios ?? [];
  return obligados
    .map((o, idx) => buildAvalPayload(o, contractId, idx + 1))
    .filter((p): p is AvalActorPayload => p !== null);
}

function buildAvalPayload(
  o: SolicitudData['obligadosSolidarios'] extends Array<infer T> | null | undefined ? T : never,
  contractId: string,
  orden: number,
): AvalActorPayload | null {
  const subtipo: 'PF' | 'PM' = mapSubtipo(o.tipo);
  const nombre =
    subtipo === 'PM'
      ? (o.razonSocial ?? '').trim()
      : [o.nombre, o.apellidoPaterno, o.apellidoMaterno].filter(Boolean).join(' ').trim();
  if (!nombre) return null;
  return {
    contractId,
    tipo: 'AVAL',
    subtipo,
    orden,
    nombre,
    rfc: o.rfc ?? undefined,
    datosAdicionales: clean({
      curp: o.curp,
      fechaNacimiento: o.fechaNacimiento,
      email: o.email,
      telefono: o.telefono,
      relacion: o.relacion,
      ingresoMensual: o.ingresoMensual,
      ocupacion: o.ocupacion,
    }),
  };
}

function mapSubtipo(t?: TipoObligado | null): 'PF' | 'PM' {
  if (t === 'PM') return 'PM';
  return 'PF';
}

// re-export para que los componentes puedan usarlo sin importar de lib/cotizacion
export { estadoCivilEnum, regimenMatrimonialEnum, generoEnum };
