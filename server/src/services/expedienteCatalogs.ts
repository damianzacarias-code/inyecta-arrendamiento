/**
 * expedienteCatalogs.ts
 * ──────────────────────────────────────────────────────────────────
 * Catálogos de tipos de documento esperados por cada actor del
 * expediente, basados en los checklists oficiales de operaciones
 * autorizadas de Inyecta:
 *
 *   - Check List Arrendamiento PFAE
 *   - Check List Arrendamiento PM
 *
 * Estos catálogos son INFORMATIVOS — son la lista que pinta el
 * checklist visual y el PDF imprimible. No bloquean la subida de
 * archivos: el usuario puede subir documentos "Libres" sin asignar
 * tipo, y la UI mostrará el actor con un checklist incompleto.
 *
 * ──────────────────────────────────────────────────────────────────
 * Convención de claves
 * ──────────────────────────────────────────────────────────────────
 * - Las claves (`tipo`) son SCREAMING_SNAKE_CASE estables.
 * - Si dos actores comparten un tipo (ej. INE en SOLICITANTE y AVAL),
 *   la clave es la misma — el catálogo del actor define el contexto.
 * - El campo `etiqueta` es lo que se muestra al usuario en español.
 * - `opcional: true` → el doc es deseable pero no cuenta como
 *   "faltante crítico" en el % de cobertura del expediente.
 */

import type { ActorTipo, ActorSubtipo, ClientType } from '@prisma/client';

export interface CatalogoDoc {
  tipo: string;
  etiqueta: string;
  opcional?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// OPERACIÓN — común a PFAE y PM
// (PM agrega "Propietario real" — se incluye condicionalmente).
// ────────────────────────────────────────────────────────────────────
const operacionPFAE: CatalogoDoc[] = [
  { tipo: 'SOLICITUD',                  etiqueta: 'Solicitud' },
  { tipo: 'VISITA_OCULAR',              etiqueta: 'Visita ocular' },
  { tipo: 'CUALITATIVO',                etiqueta: 'Cualitativo (fotos y anexos necesarios)' },
  { tipo: 'CONSULTAS_BURO_INTERVINIENTES', etiqueta: 'Consultas de buró intervinientes' },
  { tipo: 'PARAMETRIZADO',              etiqueta: 'Parametrizado' },
  { tipo: 'CONSULTA_LEGAL_INTERVINIENTES', etiqueta: 'Consulta legal intervinientes' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

const operacionPM: CatalogoDoc[] = [
  { tipo: 'SOLICITUD',                  etiqueta: 'Solicitud' },
  { tipo: 'VISITA_OCULAR',              etiqueta: 'Visita ocular' },
  { tipo: 'CUALITATIVO',                etiqueta: 'Cualitativo (fotos y anexos necesarios)' },
  { tipo: 'CONSULTAS_BURO_INTERVINIENTES', etiqueta: 'Consultas de buró intervinientes' },
  { tipo: 'PARAMETRIZADO',              etiqueta: 'Parametrizado' },
  { tipo: 'PROPIETARIO_REAL',           etiqueta: 'Propietario real' },
  { tipo: 'CONSULTA_LEGAL_INTERVINIENTES', etiqueta: 'Consulta legal intervinientes' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

// ────────────────────────────────────────────────────────────────────
// SOLICITANTE — distinto entre PFAE y PM
// ────────────────────────────────────────────────────────────────────
const solicitantePFAE: CatalogoDoc[] = [
  { tipo: 'INE',                        etiqueta: 'INE' },
  { tipo: 'CONSULTA_LISTA_NOMINAL',     etiqueta: 'Consulta lista nominal' },
  { tipo: 'CURP',                       etiqueta: 'CURP' },
  { tipo: 'CSF',                        etiqueta: 'Constancia de situación fiscal' },
  { tipo: 'COMPROBANTE_DOMICILIO',      etiqueta: 'Comprobante de domicilio' },
  { tipo: 'ACUSES_SAT_IMSS',            etiqueta: 'Acuses SAT, opinión de cumplimiento, IMSS' },
  { tipo: 'ACTA_NACIMIENTO',            etiqueta: 'Acta de nacimiento' },
  { tipo: 'ACTA_MATRIMONIO',            etiqueta: 'Acta de matrimonio', opcional: true },
  { tipo: 'DECLARACIONES',              etiqueta: 'Declaraciones' },
  { tipo: 'ESTADOS_FINANCIEROS_O_NOMINA', etiqueta: 'Estados financieros / Recibos de nómina' },
  { tipo: 'ESTADOS_CUENTA',             etiqueta: 'Estados de cuenta' },
  { tipo: 'REPORTE_BURO',               etiqueta: 'Reporte de buró de crédito' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

const solicitantePM: CatalogoDoc[] = [
  { tipo: 'CONSULTA_SIGER',             etiqueta: 'Consulta SIGER' },
  { tipo: 'ACTA_CONSTITUTIVA',          etiqueta: 'Acta constitutiva y asambleas' },
  { tipo: 'DICTAMEN_JURIDICO',          etiqueta: 'Dictamen jurídico' },
  { tipo: 'CSF',                        etiqueta: 'Constancia de situación fiscal' },
  { tipo: 'COMPROBANTE_DOMICILIO',      etiqueta: 'Comprobante de domicilio' },
  { tipo: 'ACUSES_SAT_IMSS_FIEL',       etiqueta: 'Acuses SAT, opinión de cumplimiento, IMSS, FIEL' },
  { tipo: 'DECLARACIONES',              etiqueta: 'Declaraciones' },
  { tipo: 'ESTADOS_FINANCIEROS',        etiqueta: 'Estados financieros' },
  { tipo: 'ESTADOS_CUENTA',             etiqueta: 'Estados de cuenta' },
  { tipo: 'REPORTE_BURO',               etiqueta: 'Reporte de buró de crédito' },
  { tipo: 'LISTAS_PLD',                 etiqueta: 'Listas PLD' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

// ────────────────────────────────────────────────────────────────────
// REPRESENTANTE LEGAL (solo PM)
// ────────────────────────────────────────────────────────────────────
const representanteLegal: CatalogoDoc[] = [
  { tipo: 'INE',                        etiqueta: 'INE' },
  { tipo: 'CONSULTA_LISTA_NOMINAL',     etiqueta: 'Consulta lista nominal' },
  { tipo: 'CURP',                       etiqueta: 'CURP' },
  { tipo: 'CSF',                        etiqueta: 'Constancia de situación fiscal' },
  { tipo: 'LISTAS_PLD',                 etiqueta: 'Listas PLD' },
  { tipo: 'REPORTE_BURO',               etiqueta: 'Reporte de buró de crédito' },
];

// ────────────────────────────────────────────────────────────────────
// PRINCIPAL ACCIONISTA (solo PM, único)
// ────────────────────────────────────────────────────────────────────
const principalAccionista: CatalogoDoc[] = [
  { tipo: 'INE',                        etiqueta: 'INE' },
  { tipo: 'CONSULTA_LISTA_NOMINAL',     etiqueta: 'Consulta lista nominal' },
  { tipo: 'CURP',                       etiqueta: 'CURP' },
  { tipo: 'CSF',                        etiqueta: 'Constancia de situación fiscal' },
  { tipo: 'COMPROBANTE_DOMICILIO',      etiqueta: 'Comprobante de domicilio' },
  { tipo: 'ACTA_NACIMIENTO',            etiqueta: 'Acta de nacimiento' },
  { tipo: 'ACTA_MATRIMONIO',            etiqueta: 'Acta de matrimonio', opcional: true },
  { tipo: 'LISTAS_PLD',                 etiqueta: 'Listas PLD' },
  { tipo: 'REPORTE_BURO',               etiqueta: 'Reporte de buró de crédito' },
];

// ────────────────────────────────────────────────────────────────────
// AVAL / OBLIGADO SOLIDARIO — distinto entre PF y PM
// ────────────────────────────────────────────────────────────────────
const avalPF: CatalogoDoc[] = [
  { tipo: 'INE',                        etiqueta: 'INE' },
  { tipo: 'CONSULTA_LISTA_NOMINAL',     etiqueta: 'Consulta lista nominal' },
  { tipo: 'CURP',                       etiqueta: 'CURP' },
  { tipo: 'CSF',                        etiqueta: 'Constancia de situación fiscal' },
  { tipo: 'COMPROBANTE_DOMICILIO',      etiqueta: 'Comprobante de domicilio' },
  { tipo: 'ACTA_NACIMIENTO',            etiqueta: 'Acta de nacimiento' },
  { tipo: 'ACTA_MATRIMONIO',            etiqueta: 'Acta de matrimonio', opcional: true },
  { tipo: 'RECIBOS_NOMINA',             etiqueta: 'Recibos de nómina', opcional: true },
  { tipo: 'ESTADOS_CUENTA',             etiqueta: 'Estados de cuenta', opcional: true },
  { tipo: 'REPORTE_BURO',               etiqueta: 'Reporte de buró de crédito' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

const avalPM: CatalogoDoc[] = [
  { tipo: 'CONSULTA_SIGER',             etiqueta: 'Consulta SIGER' },
  { tipo: 'ACTA_CONSTITUTIVA',          etiqueta: 'Acta constitutiva y asambleas' },
  { tipo: 'DICTAMEN_JURIDICO',          etiqueta: 'Dictamen jurídico' },
  { tipo: 'CSF',                        etiqueta: 'Constancia de situación fiscal' },
  { tipo: 'COMPROBANTE_DOMICILIO',      etiqueta: 'Comprobante de domicilio' },
  { tipo: 'ACUSES_SAT_IMSS',            etiqueta: 'Acuses SAT, opinión de cumplimiento, IMSS' },
  { tipo: 'DECLARACIONES',              etiqueta: 'Declaraciones' },
  { tipo: 'ESTADOS_FINANCIEROS',        etiqueta: 'Estados financieros' },
  { tipo: 'ESTADOS_CUENTA',             etiqueta: 'Estados de cuenta' },
  { tipo: 'REPORTE_BURO',               etiqueta: 'Reporte de buró de crédito' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

// ────────────────────────────────────────────────────────────────────
// BIEN ARRENDADO — común a PFAE y PM
// ────────────────────────────────────────────────────────────────────
const bienArrendado: CatalogoDoc[] = [
  { tipo: 'FACTURA',                    etiqueta: 'Factura' },
  { tipo: 'VALIDACION_SELLOS',          etiqueta: 'Validación de sellos' },
  { tipo: 'AVALUO',                     etiqueta: 'Avalúo' },
  { tipo: 'POLIZA_SEGURO',              etiqueta: 'Póliza del seguro' },
  { tipo: 'PERMISOS_OPERACION',         etiqueta: 'Permisos de operación' },
  { tipo: 'INSCRIPCION_RUG',            etiqueta: 'Verificación / Inscripción RUG' },
  { tipo: 'REPUVE',                     etiqueta: 'REPUVE' },
  { tipo: 'PAGO_DERECHOS_VEHICULARES',  etiqueta: 'Pago de derechos vehiculares' },
  { tipo: 'ANEXOS',                     etiqueta: 'Anexos', opcional: true },
];

// ────────────────────────────────────────────────────────────────────
// FORMALIZACIÓN — común a PFAE y PM
// ────────────────────────────────────────────────────────────────────
const formalizacion: CatalogoDoc[] = [
  { tipo: 'RESOLUCION',                 etiqueta: 'Resolución' },
  { tipo: 'CONTRATO_Y_ANEXOS',          etiqueta: 'Contrato y anexos' },
  { tipo: 'INSCRIPCION_RUG_O_RPP',      etiqueta: 'Inscripción RUG o RPP' },
];

// ────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────

/**
 * Devuelve el catálogo de documentos esperados para un actor dado,
 * según el tipo de titular del contrato y (para AVAL) el subtipo PF/PM.
 */
export function catalogoParaActor(
  tipoTitular: ClientType,
  tipoActor: ActorTipo,
  subtipoActor?: ActorSubtipo | null,
): CatalogoDoc[] {
  switch (tipoActor) {
    case 'OPERACION':
      return tipoTitular === 'PM' ? operacionPM : operacionPFAE;
    case 'SOLICITANTE':
      return tipoTitular === 'PM' ? solicitantePM : solicitantePFAE;
    case 'REPRESENTANTE_LEGAL':
      return representanteLegal;
    case 'PRINCIPAL_ACCIONISTA':
      return principalAccionista;
    case 'AVAL':
      return subtipoActor === 'PM' ? avalPM : avalPF;
    case 'BIEN_ARRENDADO':
      return bienArrendado;
    case 'FORMALIZACION':
      return formalizacion;
    default: {
      // Exhaustive guard
      const _exhaustive: never = tipoActor;
      void _exhaustive;
      return [];
    }
  }
}

/**
 * Devuelve los actores fijos que se crean automáticamente al
 * inicializar el expediente de un contrato. AVAL queda fuera
 * porque es 0..N y se agrega manualmente desde la UI.
 */
export function actoresFijosParaTitular(
  tipoTitular: ClientType,
): Array<{ tipo: ActorTipo; orden: number }> {
  const fijos: Array<{ tipo: ActorTipo; orden: number }> = [
    { tipo: 'OPERACION',       orden: 1 },
    { tipo: 'SOLICITANTE',     orden: 1 },
  ];
  if (tipoTitular === 'PM') {
    fijos.push(
      { tipo: 'REPRESENTANTE_LEGAL',   orden: 1 },
      { tipo: 'PRINCIPAL_ACCIONISTA',  orden: 1 },
    );
  }
  fijos.push(
    { tipo: 'BIEN_ARRENDADO',  orden: 1 },
    { tipo: 'FORMALIZACION',   orden: 1 },
  );
  return fijos;
}

/**
 * Devuelve true si el actor es de tipo "fijo" (único por contrato),
 * false si es dinámico (AVAL).
 */
export function esActorFijo(tipo: ActorTipo): boolean {
  return tipo !== 'AVAL';
}

/**
 * Etiqueta humana para mostrar en UI / PDF.
 */
export function etiquetaActor(
  tipo: ActorTipo,
  orden: number,
  subtipo?: ActorSubtipo | null,
): string {
  switch (tipo) {
    case 'OPERACION':            return 'Operación';
    case 'SOLICITANTE':          return 'Solicitante';
    case 'REPRESENTANTE_LEGAL':  return 'Representante Legal';
    case 'PRINCIPAL_ACCIONISTA': return 'Principal Accionista';
    case 'AVAL':
      return subtipo === 'PM'
        ? `Obligado Solidario P.M. ${orden}`
        : `Obligado Solidario P.F. ${orden}`;
    case 'BIEN_ARRENDADO':       return 'Bien Arrendado';
    case 'FORMALIZACION':        return 'Formalización';
    default: {
      const _exhaustive: never = tipo;
      void _exhaustive;
      return '—';
    }
  }
}

/**
 * Para un expediente cargado, calcula:
 *   - total esperado de documentos (suma de catálogos no opcionales por actor)
 *   - cuántos están subidos (digital)
 *   - cuántos están en físico
 *
 * Sirve para el contador "Expediente 78% completo" en la UI.
 */
export interface CoberturaPorActor {
  total: number;       // documentos requeridos (no opcionales) del actor
  cubiertos: number;   // requeridos con tieneDigital=true
  porcentaje: number;  // 0..100
}

export interface CoberturaExpediente {
  // ─── Shape canónico consumido por el frontend ────────────────
  total: number;            // = esperados (documentos requeridos)
  cubiertos: number;        // = digitalOk (un doc se considera cubierto si tiene digital)
  porcentaje: number;       // = porcentajeDigital
  porActor: Record<string, CoberturaPorActor>; // key: actor.id

  // ─── Métricas extra (digital vs físico) ──────────────────────
  esperados: number;
  digitalOk: number;
  fisicoOk: number;
  porcentajeDigital: number;
  porcentajeFisico:  number;
}

export function calcularCobertura(
  tipoTitular: ClientType,
  actores: Array<{
    id?: string;             // opcional: si viene, alimenta porActor
    tipo: ActorTipo;
    subtipo?: ActorSubtipo | null;
    documentos: Array<{ tipoDocumento: string | null; tieneFisico: boolean; tieneDigital: boolean }>;
  }>,
): CoberturaExpediente {
  let esperados = 0;
  let digitalOk = 0;
  let fisicoOk = 0;
  const porActor: Record<string, CoberturaPorActor> = {};

  const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((n / d) * 100));

  for (const actor of actores) {
    const cat = catalogoParaActor(tipoTitular, actor.tipo, actor.subtipo);
    const requeridos = cat.filter(c => !c.opcional);
    let actorTotal = 0;
    let actorDigitalOk = 0;

    for (const reqDoc of requeridos) {
      const docsDelTipo = actor.documentos.filter(d => d.tipoDocumento === reqDoc.tipo);
      const okDigital = docsDelTipo.some(d => d.tieneDigital);
      const okFisico  = docsDelTipo.some(d => d.tieneFisico);
      actorTotal++;
      if (okDigital) { digitalOk++; actorDigitalOk++; }
      if (okFisico)  fisicoOk++;
    }
    esperados += actorTotal;

    if (actor.id) {
      porActor[actor.id] = {
        total: actorTotal,
        cubiertos: actorDigitalOk,
        porcentaje: pct(actorDigitalOk, actorTotal),
      };
    }
  }

  return {
    total: esperados,
    cubiertos: digitalOk,
    porcentaje: pct(digitalOk, esperados),
    porActor,
    esperados,
    digitalOk,
    fisicoOk,
    porcentajeDigital: pct(digitalOk, esperados),
    porcentajeFisico:  pct(fisicoOk, esperados),
  };
}
