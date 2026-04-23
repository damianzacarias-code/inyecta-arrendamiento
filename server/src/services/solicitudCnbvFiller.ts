// solicitudCnbvFiller.ts
// ────────────────────────────────────────────────────────────────────
// Llenado automático del PDF "Solicitud de Crédito Simple — PFAE/PM"
// (formato CNBV) usando los datos de un Contract + sus relaciones.
//
// Cómo se construyó el mapping:
//   1) Se inspeccionó el PDF editable (247 form fields, AcroForm).
//   2) El usuario llenó dos PDFs de muestra (uno PFAE, uno PM) con
//      datos sintéticos para que pudiéramos cruzar referencias y
//      saber qué representa CADA campo (los names del PDF están
//      auto-generados por el form designer y no siempre coinciden
//      con la etiqueta visible al lado).
//   3) Para cada field se tomó el valor en ambos samples para
//      identificar a qué entidad y atributo corresponde.
//
// Quirks importantes del PDF original (no son errores del código,
// son del template; se documentan campo a campo):
//   - "Relación con el solicitante" (sin sufijo) es en realidad
//     el GÉNERO del aval 1. La etiqueta visible dice "Género".
//   - "Nacionalidad calidad migratoria extranjeros_4" es en
//     realidad el LUGAR DE NACIMIENTO del aval 2.
//   - "Email_4" es en realidad el TELÉFONO CELULAR del aval 2.
//   - "FIEL Cuando cuente con ella_2" es en realidad el RFC del
//     aval 3 (la etiqueta visible dice "RFC con homoclave").
//   - "DATOS DEL OBLIGADO SOLIDARIO 3" es un text field con
//     valor (no un encabezado): es el APELLIDO PATERNO del aval 3.
//   - Fields "Texto1..Texto24" y "Check Box1..Check Box7" son
//     overlays añadidos a mano al template para cubrir huecos del
//     diseño original; se mapean por inferencia desde los samples.
//
// Las categorías Texto6/7/8/23/24 quedaron sin uso confirmado en
// los samples. Se mapean a campos plausibles pero opcionales — si
// el dato no existe simplemente se deja en blanco.

import fs from 'fs';
import path from 'path';
import {
  PDFDocument,
  PDFForm,
  PDFTextField,
  PDFCheckBox,
} from 'pdf-lib';
import prisma from '../config/db';
import { childLogger } from '../lib/logger';

const log = childLogger('solicitud-cnbv-filler');

// ────────────────────────────────────────────────────────────
// Storage del template
// ────────────────────────────────────────────────────────────

export const TEMPLATE_DIR = path.resolve(__dirname, '..', '..', 'data', 'templates');
export const TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'solicitud-cnbv.pdf');

export function templateExists(): boolean {
  return fs.existsSync(TEMPLATE_PATH);
}

export function templateStats(): { exists: boolean; size?: number; mtime?: Date } {
  if (!templateExists()) return { exists: false };
  const st = fs.statSync(TEMPLATE_PATH);
  return { exists: true, size: st.size, mtime: st.mtime };
}

// ────────────────────────────────────────────────────────────
// Helpers de formato
// ────────────────────────────────────────────────────────────

function fmtMoney(n: number | string | { toString(): string } | null | undefined): string {
  if (n == null) return '';
  const num = typeof n === 'number' ? n : Number(n.toString());
  if (isNaN(num)) return '';
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateMx(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function generoLabel(g: string | null | undefined): string {
  if (!g) return '';
  if (g === 'M') return 'Masculino';
  if (g === 'F') return 'Femenino';
  if (g === 'OTRO') return 'Otro';
  return '';
}

function nombreCompleto(c: { nombre?: string | null; apellidoPaterno?: string | null; apellidoMaterno?: string | null }): string {
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

function clientDisplay(c: { tipo: string; nombre?: string | null; apellidoPaterno?: string | null; apellidoMaterno?: string | null; razonSocial?: string | null }): string {
  if (c.tipo === 'PM') return c.razonSocial ?? '';
  return nombreCompleto(c);
}

// ────────────────────────────────────────────────────────────
// Setters resilientes (no tirar la generación si un field no existe)
// ────────────────────────────────────────────────────────────

interface FillCtx {
  form: PDFForm;
  /** Contador de fields llenados, para reporte de cobertura. */
  filled: { text: number; check: number; missing: string[] };
}

function setText(ctx: FillCtx, name: string, value: string | number | null | undefined) {
  const v = value == null ? '' : String(value);
  if (!v) return; // no sobreescribir con vacío (deja el placeholder del template)
  try {
    const f = ctx.form.getField(name);
    if (f instanceof PDFTextField) {
      f.setText(v);
      ctx.filled.text++;
    } else {
      log.warn({ name, kind: f.constructor.name }, 'field no es text');
    }
  } catch {
    ctx.filled.missing.push(name);
  }
}

function setCheck(ctx: FillCtx, name: string, value: boolean | null | undefined) {
  if (value == null) return;
  try {
    const f = ctx.form.getField(name);
    if (f instanceof PDFCheckBox) {
      if (value) f.check();
      else f.uncheck();
      ctx.filled.check++;
    } else {
      log.warn({ name, kind: f.constructor.name }, 'field no es checkbox');
    }
  } catch {
    ctx.filled.missing.push(name);
  }
}

/** Setea un grupo de checkboxes excluyentes. Marca el que matchee la key,
 *  desmarca los demás. */
function setRadio(ctx: FillCtx, mapping: Record<string, string>, selected: string | null | undefined) {
  for (const [key, fieldName] of Object.entries(mapping)) {
    setCheck(ctx, fieldName, selected === key);
  }
}

// ────────────────────────────────────────────────────────────
// Carga del contrato con todas las relaciones necesarias
// ────────────────────────────────────────────────────────────

export type ContractWithAll = NonNullable<Awaited<ReturnType<typeof loadContractWithAll>>>;

export async function loadContractWithAll(contractId: string) {
  return prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      client: {
        include: {
          representanteLegalData: true,
          socios: { orderBy: { porcentaje: 'desc' } },
        },
      },
      proveedorData: true,
      perfilTransaccional: true,
      declaracionesPEP: true,
      // Los avales ahora viven en ExpedienteActor (uno por contrato), con
      // los campos extendidos del KYC en `datosAdicionales` (JSON).
      actores: {
        where: { tipo: 'AVAL' },
        orderBy: { orden: 'asc' },
      },
    },
  });
}

/**
 * Vista normalizada de un aval para el filler. Combina las columnas
 * fijas de ExpedienteActor (nombre, rfc) con los campos extendidos
 * que viven en `datosAdicionales` (JSON). Los nombres de campo
 * coinciden con el shape del antiguo modelo Guarantor para que los
 * mapping de PDF no necesiten cambiar.
 */
type AvalView = {
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
  rfc: string | null;
  fiel: string | null;
  curp: string | null;
  genero: string | null;
  fechaNacimiento: Date | null;
  lugarNacimiento: string | null;
  nacionalidad: string | null;
  estadoCivil: string | null;
  regimenMatrimonial: string | null;
  nombreConyuge: string | null;
  calle: string | null;
  numExterior: string | null;
  numInterior: string | null;
  colonia: string | null;
  municipio: string | null;
  ciudad: string | null;
  estado: string | null;
  pais: string | null;
  cp: string | null;
  telefonoFijo: string | null;
  telefonoCelular: string | null;
  email: string | null;
  relacion: string | null;
  representanteNombre: string | null;
  representanteApellidoPaterno: string | null;
  representanteApellidoMaterno: string | null;
  representanteRfc: string | null;
};

function actorToAval(actor: ContractWithAll['actores'][number]): AvalView {
  const extra = (actor.datosAdicionales as Record<string, unknown> | null) ?? {};
  const str = (k: string): string | null => {
    const v = extra[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  const date = (k: string): Date | null => {
    const v = extra[k];
    if (typeof v !== 'string') return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  // El subtipo distingue PF de PM. Si es PM, `nombre` se interpreta
  // como razón social y se vacía el bloque de PF.
  const esPM = actor.subtipo === 'PM';
  return {
    nombre: esPM ? null : actor.nombre ?? str('nombre'),
    apellidoPaterno: esPM ? null : str('apellidoPaterno'),
    apellidoMaterno: esPM ? null : str('apellidoMaterno'),
    razonSocial: esPM ? actor.nombre ?? str('razonSocial') : null,
    rfc: actor.rfc ?? str('rfc'),
    fiel: str('fiel'),
    curp: str('curp'),
    genero: str('genero'),
    fechaNacimiento: date('fechaNacimiento'),
    lugarNacimiento: str('lugarNacimiento'),
    nacionalidad: str('nacionalidad'),
    estadoCivil: str('estadoCivil'),
    regimenMatrimonial: str('regimenMatrimonial'),
    nombreConyuge: str('nombreConyuge'),
    calle: str('calle'),
    numExterior: str('numExterior'),
    numInterior: str('numInterior'),
    colonia: str('colonia'),
    municipio: str('municipio'),
    ciudad: str('ciudad'),
    estado: str('estado'),
    pais: str('pais'),
    cp: str('cp'),
    telefonoFijo: str('telefonoFijo'),
    telefonoCelular: str('telefonoCelular') ?? str('telefono'),
    email: str('email'),
    relacion: str('relacion'),
    representanteNombre: str('representanteNombre'),
    representanteApellidoPaterno: str('representanteApellidoPaterno'),
    representanteApellidoMaterno: str('representanteApellidoMaterno'),
    representanteRfc: str('representanteRfc'),
  };
}

function avalNombreCompleto(av: AvalView): string {
  return [av.nombre, av.apellidoPaterno, av.apellidoMaterno].filter(Boolean).join(' ');
}

// ────────────────────────────────────────────────────────────
// Función principal de llenado
// ────────────────────────────────────────────────────────────

export interface FillResult {
  pdf: Uint8Array;
  coverage: { text: number; check: number; missing: string[] };
}

export async function fillSolicitudCnbv(contractId: string): Promise<FillResult> {
  if (!templateExists()) {
    throw new Error('TEMPLATE_NOT_UPLOADED');
  }

  const contract = await loadContractWithAll(contractId);
  if (!contract) throw new Error('CONTRACT_NOT_FOUND');

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const ctx: FillCtx = { form, filled: { text: 0, check: 0, missing: [] } };

  fillSeccionSolicitud(ctx, contract);
  fillSeccionSolicitante(ctx, contract);
  fillSeccionRepresentanteLegal(ctx, contract);
  fillSeccionSocio(ctx, contract);
  fillSeccionAval(ctx, contract, 1);
  fillSeccionAval(ctx, contract, 2);
  fillSeccionAval(ctx, contract, 3);
  fillSeccionPerfilTransaccional(ctx, contract);
  fillSeccionBienYProveedor(ctx, contract);
  fillSeccionDeclaracionesPEP(ctx, contract);
  fillSeccionFirmas(ctx, contract);

  // No aplanar: dejar el PDF editable para que el usuario pueda revisar
  // y corregir antes de imprimir.
  const pdf = await pdfDoc.save();

  log.info(
    {
      contractId,
      folio: contract.folio,
      coverage: { text: ctx.filled.text, check: ctx.filled.check, missing: ctx.filled.missing.length },
    },
    'solicitud CNBV generada',
  );

  return { pdf, coverage: ctx.filled };
}

// ────────────────────────────────────────────────────────────
// SECCIONES
// ────────────────────────────────────────────────────────────

// Sección 1: Datos generales de la solicitud
function fillSeccionSolicitud(ctx: FillCtx, c: ContractWithAll) {
  setText(ctx, 'Lugar donde se elabora la solicitud', c.lugarSolicitud);
  setText(ctx, 'Fecha de la solicitud', fmtDateMx(c.fechaSolicitud));
  setText(ctx, 'Promotor', c.promotor);
  setText(ctx, 'Monto solicitado', fmtMoney(c.montoSolicitado));
  setText(ctx, 'Plazo No de meses', c.plazo);
  setCheck(ctx, 'Puro', c.producto === 'PURO');
  setCheck(ctx, 'Financiero', c.producto === 'FINANCIERO');
  setText(ctx, 'Destino específico del arrendamiento', c.destinoArrendamiento);
}

// Sección 2: Datos del solicitante (Cliente)
function fillSeccionSolicitante(ctx: FillCtx, c: ContractWithAll) {
  const cl = c.client;
  setText(ctx, 'Nombre completo del solicitante o razón social', clientDisplay(cl));
  setCheck(ctx, 'PM', cl.tipo === 'PM');
  setCheck(ctx, 'PFAE', cl.tipo === 'PFAE');
  setText(ctx, 'RFC con homoclave', cl.rfc);
  setText(ctx, 'FIEL', cl.fiel);
  setText(ctx, 'Actividad', cl.actividadEconomica ?? cl.sector);
  setText(ctx, 'CURP En caso de PFAE', cl.tipo === 'PFAE' ? cl.curp : '');
  setText(ctx, 'Registro patronal IMSS', cl.registroIMSS);
  setText(ctx, 'Domicilio fiscal', cl.calle);
  setText(ctx, 'No Exterior', cl.numExterior);
  setText(ctx, 'No Interior', cl.numInterior);
  setText(ctx, 'Colonia', cl.colonia);
  setText(ctx, 'Código postal', cl.cp);
  setText(ctx, 'Ciudad  Población', cl.ciudad);
  setText(ctx, 'Municipio  Delegación', cl.municipio);
  setText(ctx, 'Estado', cl.estado);
  // Texto3 = país solicitante (no hay "País" sin sufijo en el template)
  setText(ctx, 'Texto3', cl.pais ?? 'México');
  // Texto1 = años de antigüedad de la empresa/PFAE en el domicilio
  setText(ctx, 'Texto1', cl.anosAntiguedadActividad);
  // Texto2 / Texto4 / Texto5 = teléfonos y email del solicitante
  setText(ctx, 'Texto2', cl.telefonoOficina);
  setText(ctx, 'Texto4', cl.telefono);
  setText(ctx, 'Texto5', cl.email);
  // PM-only
  setText(ctx, 'Fecha de constitución', cl.tipo === 'PM' ? fmtDateMx(cl.fechaConstitucion) : '');
  setText(ctx, 'Capital social', cl.tipo === 'PM' ? fmtMoney(cl.capitalSocial) : '');
  // Texto9 = folio mercantil (PM)
  if (cl.tipo === 'PM' && cl.folioMercantil) {
    const fechaTxt = cl.fechaInscripcionRPC ? `, inscrito el ${fmtDateMx(cl.fechaInscripcionRPC)}` : '';
    setText(ctx, 'Texto9', `${cl.folioMercantil}${fechaTxt}`);
  }
  // Tipo de instalación del solicitante (Propias/Rentadas/etc.)
  // Client no tiene este campo en el schema actual; queda sin marcar
  // hasta que se agregue. (Quirk del schema, no del PDF.)
}

// Sección 3: Datos del representante legal (o el PFAE mismo)
function fillSeccionRepresentanteLegal(ctx: FillCtx, c: ContractWithAll) {
  const cl = c.client;
  const rl = cl.representanteLegalData;
  // Si es PFAE y no hay representanteLegalData explícito, usamos el cliente
  // mismo como rep legal (el solicitante PFAE actúa por sí mismo).
  const pfaeAsSelf = cl.tipo === 'PFAE' && !rl;

  const repLegal = rl ?? (pfaeAsSelf ? {
    nombre: cl.nombre ?? '',
    apellidoPaterno: cl.apellidoPaterno ?? '',
    apellidoMaterno: cl.apellidoMaterno ?? null,
    rfc: cl.rfc ?? null,
    curp: cl.curp ?? null,
    fiel: cl.fiel ?? null,
    genero: null,
    ocupacion: 'Titular de la actividad empresarial',
    fechaNacimiento: null,
    lugarNacimiento: null,
    nacionalidad: 'Mexicana',
    estadoCivil: null,
    regimenMatrimonial: null,
    nombreConyuge: null,
    calle: cl.calle ?? null,
    numExterior: cl.numExterior ?? null,
    numInterior: cl.numInterior ?? null,
    colonia: cl.colonia ?? null,
    municipio: cl.municipio ?? null,
    ciudad: cl.ciudad ?? null,
    estado: cl.estado ?? null,
    pais: cl.pais ?? 'México',
    cp: cl.cp ?? null,
    situacionInstalaciones: null,
    tiempoResidenciaAnos: null,
    telefonoFijo: cl.telefonoOficina ?? null,
    telefonoCelular: cl.telefono ?? null,
    email: cl.email ?? null,
    fechaInscripcionPoderes: null,
    folioInscripcionPoderes: null,
  } as const : null);

  if (!repLegal) return; // PM sin RepresentanteLegal aún

  setText(ctx, 'Nombre', repLegal.nombre);
  setText(ctx, 'Apellido paterno', repLegal.apellidoPaterno);
  setText(ctx, 'Apellido materno', repLegal.apellidoMaterno);
  setText(ctx, 'RFC con homoclave_2', repLegal.rfc);
  setText(ctx, 'Género', generoLabel(repLegal.genero));
  setText(ctx, 'Domicilio particular', repLegal.calle);
  setText(ctx, 'No Exterior_2', repLegal.numExterior);
  setText(ctx, 'No Interior_2', repLegal.numInterior);
  setText(ctx, 'Texto10', repLegal.colonia);
  setText(ctx, 'Código postal_2', repLegal.cp);
  setText(ctx, 'Ciudad  Población_2', repLegal.ciudad);
  setText(ctx, 'Municipio  Delegación_2', repLegal.municipio);
  setText(ctx, 'Estado_2', repLegal.estado);
  setText(ctx, 'País', repLegal.pais);
  setText(ctx, 'Tiempo de residencia Años', repLegal.tiempoResidenciaAnos);
  setText(ctx, 'Fecha de nacimiento', fmtDateMx(repLegal.fechaNacimiento));
  setText(ctx, 'Lugar de nacimiento', repLegal.lugarNacimiento);
  setText(ctx, 'Nacionalidad calidad migratoria extranjeros', repLegal.nacionalidad);
  setText(ctx, 'Teléfono celular', repLegal.telefonoCelular);
  setText(ctx, 'Texto14', repLegal.telefonoFijo);
  setText(ctx, 'Email', repLegal.email);
  setCheck(ctx, 'Casado', repLegal.estadoCivil === 'CASADO');
  setCheck(ctx, 'Soltero', repLegal.estadoCivil === 'SOLTERO');
  setCheck(ctx, 'Separación de bienes', repLegal.regimenMatrimonial === 'SEPARACION_BIENES');
  setCheck(ctx, 'Sociedad conyugal', repLegal.regimenMatrimonial === 'SOCIEDAD_CONYUGAL');
  setText(ctx, 'Nombre completo del cónyuge', repLegal.nombreConyuge);
  // PM only: poderes RPC
  if (cl.tipo === 'PM' && rl?.folioInscripcionPoderes) {
    const fechaTxt = rl.fechaInscripcionPoderes ? `, inscrito el ${fmtDateMx(rl.fechaInscripcionPoderes)}` : '';
    setText(ctx, 'Datos de la inscripción en el Registro Público de Comercio de los poderes o folio mercantil',
      `${rl.folioInscripcionPoderes}${fechaTxt}`);
  }
  // % de acciones del rep legal: si está como socio con esRepLegal=true
  const repAsSocio = cl.socios.find(s => s.esRepLegal);
  if (repAsSocio) {
    setText(ctx, 'En caso de ser socio especificar el porcentaje de acciones', `${Number(repAsSocio.porcentaje).toFixed(0)}%`);
  }
  // Puesto/cargo del rep legal
  setText(ctx, 'Texto12', rl?.ocupacion ?? (pfaeAsSelf ? 'Titular de la actividad empresarial' : ''));
  // CURP del rep legal
  setText(ctx, 'Texto13', repLegal.curp);
}

// Sección 4: Datos del socio o accionista principal (PM)
function fillSeccionSocio(ctx: FillCtx, c: ContractWithAll) {
  const cl = c.client;
  if (cl.tipo !== 'PM') return;
  // Tomamos el socio NO rep-legal con mayor porcentaje. Si no hay,
  // tomamos el primero. Lista ya viene ordenada por porcentaje desc.
  const socio = cl.socios.find(s => !s.esRepLegal) ?? cl.socios[0];
  if (!socio) return;

  setText(ctx, 'Nombre o razón social', socio.razonSocial ?? nombreCompleto(socio));
  setText(ctx, 'RFC con homoclave_3', socio.rfc);
  setText(ctx, 'Años de experiencia en el sector', socio.anosExperiencia);
  setText(ctx, 'Domicilio particular fiscal si se trata de una persona moral', socio.calle);
  setText(ctx, 'No Exterior_3', socio.numExterior);
  setText(ctx, 'No Interior_3', socio.numInterior);
  setText(ctx, 'Colonia_2', socio.colonia);
  setText(ctx, 'Código postal_3', socio.cp);
  setText(ctx, 'Ciudad  Población_3', socio.ciudad);
  setText(ctx, 'Municipio  Delegación_3', socio.municipio);
  setText(ctx, 'Estado_3', socio.estado);
  setText(ctx, 'País_2', socio.pais);
  setText(ctx, 'CURP', socio.curp);
  setText(ctx, 'Fecha de nacimiento_2', fmtDateMx(socio.fechaNacimiento));
  setText(ctx, 'Lugar de nacimiento_2', socio.lugarNacimiento);
  setText(ctx, 'Nacionalidad calidad migratoria extranjeros_2', socio.nacionalidad);
  setText(ctx, 'Teléfono fijo', socio.telefonoFijo);
  setText(ctx, 'Teléfono celular_2', socio.telefonoCelular);
  setText(ctx, 'Email_2', socio.email);
  setCheck(ctx, 'Casado_2', socio.estadoCivil === 'CASADO');
  setCheck(ctx, 'Soltero_2', socio.estadoCivil === 'SOLTERO');
  setCheck(ctx, 'Separación de bienes_2', socio.regimenMatrimonial === 'SEPARACION_BIENES');
  setCheck(ctx, 'Sociedad conyugal_2', socio.regimenMatrimonial === 'SOCIEDAD_CONYUGAL');
  setText(ctx, 'Nombre completo del cónyuge_2', socio.nombreConyuge);
  setText(ctx, 'Porcentaje de acciones', `${Number(socio.porcentaje).toFixed(0)}%`);
  // Datos de constitución del solicitante PM van en la misma sección
  if (cl.actaConstitutiva || cl.folioMercantil) {
    const partes = [
      cl.actaConstitutiva,
      cl.folioMercantil ? `Folio Mercantil ${cl.folioMercantil}` : null,
      cl.fechaInscripcionRPC ? `del ${fmtDateMx(cl.fechaInscripcionRPC)}` : null,
    ].filter(Boolean);
    setText(ctx,
      'Fecha y datos de la inscripción en el Registro Público de Comercio de la escritura constitutiva o folio mercantil',
      partes.join(' '));
  }
}

// Sección 5/6/7: Avales/obligados solidarios 1, 2, 3
function fillSeccionAval(ctx: FillCtx, c: ContractWithAll, orden: 1 | 2 | 3) {
  const actor = c.actores.find((a) => a.orden === orden);
  if (!actor) return;
  const av = actorToAval(actor);

  // Mapping de field names por orden de aval. Cada slot tiene una
  // colección de campos diferente porque el PDF original mezcla
  // sufijos (_2, _3, _4, _5, _6) y "Texto*"/"Check Box*" sin patrón
  // claro. Documentado field por field arriba.
  if (orden === 1) {
    setText(ctx, 'Nombre o razón social_2', av.razonSocial ?? avalNombreCompleto(av));
    setText(ctx, 'RFC con homoclave_5', av.rfc);
    setText(ctx, 'FIEL_2', av.fiel);
    // QUIRK: este field guarda el GÉNERO (etiqueta visible "Género")
    setText(ctx, 'Relación con el solicitante', generoLabel(av.genero));
    setText(ctx, 'Domicilio particular fiscal si se trata de una persona moral_2', av.calle);
    setText(ctx, 'No Exterior_4', av.numExterior);
    setText(ctx, 'No Interior_4', av.numInterior);
    setText(ctx, 'Colonia_3', av.colonia);
    setText(ctx, 'Código postal_4', av.cp);
    setText(ctx, 'Texto15', av.ciudad);
    setText(ctx, 'Municipio  Delegación_4', av.municipio);
    setText(ctx, 'Estado_4', av.estado);
    setText(ctx, 'País_3', av.pais);
    setText(ctx, 'CURP_2', av.curp);
    setText(ctx, 'Fecha de nacimiento_3', fmtDateMx(av.fechaNacimiento));
    setText(ctx, 'Lugar de nacimiento_3', av.lugarNacimiento);
    setText(ctx, 'Nacionalidad calidad migratoria extranjeros_3', av.nacionalidad);
    setText(ctx, 'Teléfono fijo_2', av.telefonoFijo);
    setText(ctx, 'Teléfono celular_3', av.telefonoCelular);
    setText(ctx, 'Email_3', av.email);
    setCheck(ctx, 'Casado_3', av.estadoCivil === 'CASADO');
    setCheck(ctx, 'Soltero_3', av.estadoCivil === 'SOLTERO');
    setCheck(ctx, 'Separación de bienes_3', av.regimenMatrimonial === 'SEPARACION_BIENES');
    setCheck(ctx, 'Sociedad conyugal_3', av.regimenMatrimonial === 'SOCIEDAD_CONYUGAL');
    setText(ctx, 'Nombre completo del cónyuge_3', av.nombreConyuge);
    setText(ctx, 'Texto16', av.relacion);
    // Si el aval es PM, su rep legal va aquí (slot único en el PDF):
    if (av.razonSocial && av.representanteNombre) {
      setText(ctx, 'Nombre del representante  apoderado legal', av.representanteNombre);
      setText(ctx, 'Apellido paterno_2', av.representanteApellidoPaterno);
      setText(ctx, 'Apellido materno_2', av.representanteApellidoMaterno);
      setText(ctx, 'RFC con homoclave_4', av.representanteRfc);
    }
  }

  if (orden === 2) {
    setText(ctx, 'Nombre_2', av.nombre);
    setText(ctx, 'Apellido paterno_3', av.apellidoPaterno);
    setText(ctx, 'Apellido materno_3', av.apellidoMaterno);
    setText(ctx, 'RFC con homoclave_6', av.rfc);
    setText(ctx, 'FIEL Cuando cuente con ella', av.fiel);
    setText(ctx, 'Género_2', generoLabel(av.genero));
    setText(ctx, 'Relación con el solicitante_2', av.relacion);
    setText(ctx, 'Texto17', av.calle);
    // No hay slot named para el numExterior del aval 2 en el template;
    // probable fill manual. Texto6 lo cubrimos como heurística.
    setText(ctx, 'Texto6', av.numExterior);
    setText(ctx, 'Texto18', av.numInterior);
    setText(ctx, 'Colonia_4', av.colonia);
    setText(ctx, 'Código postal_5', av.cp);
    setText(ctx, 'Ciudad  Población_4', av.ciudad);
    setText(ctx, 'Municipio  Delegación_5', av.municipio);
    setText(ctx, 'Estado_5', av.estado);
    setText(ctx, 'País_4', av.pais);
    setText(ctx, 'CURP_3', av.curp);
    setText(ctx, 'Fecha de nacimiento_4', fmtDateMx(av.fechaNacimiento));
    // QUIRK: este field guarda el LUGAR DE NACIMIENTO del aval 2
    setText(ctx, 'Nacionalidad calidad migratoria extranjeros_4', av.lugarNacimiento);
    setText(ctx, 'Texto19', av.nacionalidad);
    setText(ctx, 'Teléfono fijo_3', av.telefonoFijo);
    // QUIRK: este field guarda el TELÉFONO CELULAR del aval 2
    setText(ctx, 'Email_4', av.telefonoCelular);
    setText(ctx, 'Texto20', av.email);
    setCheck(ctx, 'Casado_4', av.estadoCivil === 'CASADO');
    setCheck(ctx, 'Soltero_4', av.estadoCivil === 'SOLTERO');
    setCheck(ctx, 'Separación de bienes_4', av.regimenMatrimonial === 'SEPARACION_BIENES');
    setCheck(ctx, 'Sociedad conyugal_4', av.regimenMatrimonial === 'SOCIEDAD_CONYUGAL');
    setText(ctx, 'Nombre completo del cónyuge_4', av.nombreConyuge);
  }

  if (orden === 3) {
    setText(ctx, 'Nombre_3', av.nombre);
    // QUIRK: "DATOS DEL OBLIGADO SOLIDARIO 3" es un text field con el
    // valor del apellido paterno (no un encabezado).
    setText(ctx, 'DATOS DEL OBLIGADO SOLIDARIO 3', av.apellidoPaterno);
    setText(ctx, 'Apellido materno_4', av.apellidoMaterno);
    // QUIRK: "FIEL Cuando cuente con ella_2" en realidad guarda el RFC
    setText(ctx, 'FIEL Cuando cuente con ella_2', av.rfc);
    setText(ctx, 'Texto21', av.fiel);
    // QUIRK: "Relación con el solicitante_3" guarda el GÉNERO
    setText(ctx, 'Relación con el solicitante_3', generoLabel(av.genero));
    setText(ctx, 'Texto22', av.relacion);
    setText(ctx, 'Domicilio particular fiscal si se trata de una persona moral_3', av.calle);
    setText(ctx, 'No Exterior_5', av.numExterior);
    setText(ctx, 'No Interior_6', av.numInterior);
    setText(ctx, 'Colonia_5', av.colonia);
    setText(ctx, 'Código postal_6', av.cp);
    setText(ctx, 'Ciudad  Población_5', av.ciudad);
    setText(ctx, 'Municipio  Delegación_6', av.municipio);
    setText(ctx, 'Estado_6', av.estado);
    setText(ctx, 'País_5', av.pais);
    setText(ctx, 'CURP_4', av.curp);
    setText(ctx, 'Fecha de nacimiento_5', fmtDateMx(av.fechaNacimiento));
    setText(ctx, 'Lugar de nacimiento_4', av.lugarNacimiento);
    setText(ctx, 'Nacionalidad calidad migratoria extranjeros_5', av.nacionalidad);
    setText(ctx, 'Teléfono fijo_4', av.telefonoFijo);
    setText(ctx, 'Teléfono celular_4', av.telefonoCelular);
    setText(ctx, 'Email_5', av.email);
    setCheck(ctx, 'Casado_5', av.estadoCivil === 'CASADO');
    setCheck(ctx, 'Soltero_5', av.estadoCivil === 'SOLTERO');
    setCheck(ctx, 'Separación de bienes_5', av.regimenMatrimonial === 'SEPARACION_BIENES');
    setCheck(ctx, 'Sociedad conyugal_5', av.regimenMatrimonial === 'SOCIEDAD_CONYUGAL');
    setText(ctx, 'Nombre completo del cónyuge_5', av.nombreConyuge);
  }
}

// Sección 8: Perfil transaccional
function fillSeccionPerfilTransaccional(ctx: FillCtx, c: ContractWithAll) {
  const p = c.perfilTransaccional;
  if (!p) return;
  setText(ctx, 'Productos que adquirirá', p.productosQueAdquirira);
  setText(ctx, 'Origen de los recursos a operar', p.origenRecursos);
  // QUIRK: este field guarda el destino, no el número de operaciones
  setText(ctx, 'Número de operaciones estimado mensual', p.destinoRecursos);
  // Número de operaciones (3 checkboxes excluyentes)
  setRadio(ctx, {
    UNO_A_TREINTA: '1 a 30',
    TREINTAIUNO_A_CINCUENTA: '31 a 50',
    MAS_DE_CINCUENTA: '50',
  }, p.numOperacionesRango);
  // ¿Realiza pagos en efectivo?
  setCheck(ctx, 'Sí', p.realizaPagosEfectivo === true);
  setCheck(ctx, 'No', p.realizaPagosEfectivo === false);
  // Detalles de efectivo
  if (p.realizaPagosEfectivo && (p.efectivoMotivos || p.efectivoMontoMensual)) {
    const partes = [
      p.efectivoMotivos,
      p.efectivoMontoMensual ? `Monto mensual estimado: ${fmtMoney(p.efectivoMontoMensual)}` : null,
    ].filter(Boolean);
    setText(ctx, 'En caso de utilizar dinero en efectivo favor de especificar motivos y monto estimado mensual',
      partes.join(' — '));
  } else {
    setText(ctx, 'En caso de utilizar dinero en efectivo favor de especificar motivos y monto estimado mensual',
      'N/A — No se utilizará dinero en efectivo');
  }
  // Monto mensual y frecuencia: Check Box 1-7 sin etiqueta semántica
  // confirmada en los samples. Los dejamos sin marcar hasta tener
  // el visual layout del template para confirmar.
  // (Si el usuario quiere marcarlos, lo hace a mano sobre el PDF
  // generado — el template queda editable.)
}

// Sección 9: Datos del bien y proveedor
function fillSeccionBienYProveedor(ctx: FillCtx, c: ContractWithAll) {
  // Descripción del bien (puede combinar marca/modelo/año)
  const descPartes = [
    c.bienDescripcion,
    c.bienMarca,
    c.bienModelo,
    c.bienAnio ? `modelo ${c.bienAnio}` : null,
  ].filter(Boolean);
  setText(ctx, 'Descripción', descPartes.join(' '));
  setText(ctx, 'Valor dellos bienes', fmtMoney(c.valorBien));

  const prov = c.proveedorData;
  if (prov) {
    setText(ctx, 'Nombre de proveedor', prov.nombre);
    setText(ctx, 'Nombre del contacto', prov.nombreContacto);
    setText(ctx, 'Teléfono de proveedor', prov.telefono);
    setText(ctx, 'Correo de proveedor', prov.email);
  } else if (c.proveedor) {
    // Fallback: si solo está el legacy string
    setText(ctx, 'Nombre de proveedor', c.proveedor);
  }

  // Tercer beneficiario / aportante (Sí_2/No_2)
  setCheck(ctx, 'Sí_2', c.tercerBeneficiarioExiste === true);
  setCheck(ctx, 'No_2', c.tercerBeneficiarioExiste === false);
}

// Sección 10: Declaraciones PEP
function fillSeccionDeclaracionesPEP(ctx: FillCtx, c: ContractWithAll) {
  const decls = c.declaracionesPEP;
  // El PDF tiene 3 bloques PEP que mapean a SOLICITANTE / PARIENTE /
  // SOCIO_ACCIONISTA y, para cada uno, un Sí/No + datos opcionales.
  const bySol = decls.find(d => d.tipo === 'SOLICITANTE');
  const byPar = decls.find(d => d.tipo === 'PARIENTE');
  const bySoc = decls.find(d => d.tipo === 'SOCIO_ACCIONISTA');

  // Bloque 1: solicitante (Sí_3 / No_3)
  if (bySol) {
    setCheck(ctx, 'Sí_3', bySol.esPep === true);
    setCheck(ctx, 'No_3', bySol.esPep === false);
    if (bySol.esPep) {
      setText(ctx, 'Puesto', bySol.puesto);
      setText(ctx, 'Principales funciones', bySol.principalesFunciones);
    }
  }

  // Bloque 2: pariente (Sí_4 / No_4)
  if (byPar) {
    setCheck(ctx, 'Sí_4', byPar.esPep === true);
    setCheck(ctx, 'No_4', byPar.esPep === false);
    if (byPar.esPep) {
      setText(ctx, 'En caso positivo especificar Nombre', byPar.nombre);
      setText(ctx, 'Parentesco  Relación', byPar.parentesco);
      setText(ctx, 'Dependencia', byPar.dependencia);
      setText(ctx, 'Puesto_2', byPar.puesto);
      setText(ctx, 'Período de ejercicio', byPar.periodoEjercicio);
      setText(ctx, 'Principales funciones_2', byPar.principalesFunciones);
    }
  }

  // Bloque 3: socio o accionista (Sí_5 / No_5)
  if (bySoc) {
    setCheck(ctx, 'Sí_5', bySoc.esPep === true);
    setCheck(ctx, 'No_5', bySoc.esPep === false);
    if (bySoc.esPep) {
      setText(ctx, 'En caso positivo especificar Dependencia', bySoc.dependencia);
      setText(ctx, 'Puesto_3', bySoc.puesto);
      setText(ctx, 'Periodo de ejercicio', bySoc.periodoEjercicio);
      setText(ctx, 'Principales funciones_3', bySoc.principalesFunciones);
    }
  }

  // Sí_6 / No_6: declaración de actuar por cuenta propia (default = No actúa
  // por cuenta de tercero → "No"). El campo no existe explícito en el modelo
  // de datos; tomamos el valor de `tercerAportanteExiste` invertido.
  setCheck(ctx, 'Sí_6', c.tercerAportanteExiste === true);
  setCheck(ctx, 'No_6', c.tercerAportanteExiste === false);
}

// Sección 11: Firmas (textos de los recuadros, no firmas reales)
function fillSeccionFirmas(ctx: FillCtx, c: ContractWithAll) {
  const cl = c.client;
  const nombreSolic = clientDisplay(cl);
  const avales = c.actores.map(actorToAval);
  const nombresAvales = avales
    .map((a) => avalNombreCompleto(a) || a.razonSocial || '')
    .filter(Boolean)
    .join(' / ');

  setText(ctx, 'Firma del solicitante', nombreSolic);
  setText(ctx, 'Firma del solicitante_2', nombreSolic);
  setText(ctx, 'Autorización del solicitante', nombreSolic);

  if (nombresAvales) {
    setText(ctx, 'Firmas de avales y obligados solidarios yo garantes', nombresAvales);
    setText(ctx, 'Autorizaciónes de avales y obligados solidarios', nombresAvales);
  }

  const av1 = c.actores.find((a) => a.orden === 1);
  const av2 = c.actores.find((a) => a.orden === 2);
  const av3 = c.actores.find((a) => a.orden === 3);
  const firma = (a: ContractWithAll['actores'][number] | undefined): string | null => {
    if (!a) return null;
    const v = actorToAval(a);
    return avalNombreCompleto(v) || v.razonSocial;
  };
  if (av1) setText(ctx, 'Firma del aval y obligado solidario 1', firma(av1));
  if (av2) setText(ctx, 'Firma del aval y obligado solidario 2', firma(av2));
  if (av3) setText(ctx, 'Firma del aval y obligado solidario 3', firma(av3));
}
