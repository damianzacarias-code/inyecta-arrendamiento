/**
 * types.ts — Tipos del lado del cliente para la Solicitud de Arrendamiento.
 *
 * Espeja el schema Zod del backend en:
 *   server/src/services/pdfExtract/schemas.ts → `solicitudSchema`
 *
 * Se mantiene flat (sin generics complejos) para facilitar el render en
 * las cards de revisión y la serialización a los payloads de
 * /clients y /contracts. Todos los campos son opcionales porque el
 * modelo puede no encontrar un dato si está borroso o ausente.
 */

export type TipoSolicitante = 'PFAE' | 'PM';
export type TipoArrendamiento = 'PURO' | 'FINANCIERO';
export type SexoHM = 'H' | 'M';
export type TipoObligado = 'PFAE' | 'PM' | 'PF';

export interface SolicitudOperacion {
  tipoArrendamiento?: TipoArrendamiento | null;
  plazoMeses?: number | null;
  moneda?: string | null;
  destino?: string | null;
}

export interface SolicitudBien {
  descripcion?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  numSerie?: string | null;
  color?: string | null;
  valorConIVA?: number | null;
  nuevo?: boolean | null;
  proveedor?: string | null;
  rfcProveedor?: string | null;
}

export interface SolicitudDomicilio {
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  codigoPostal?: string | null;
  pais?: string | null;
  tipoInmueble?: string | null;
  antiguedadDomicilio?: string | null;
}

export interface SolicitudPFAE extends SolicitudDomicilio {
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  rfc?: string | null;
  curp?: string | null;
  fechaNacimiento?: string | null;
  lugarNacimiento?: string | null;
  nacionalidad?: string | null;
  sexo?: SexoHM | null;
  estadoCivil?: string | null;
  regimenMatrimonial?: string | null;
  email?: string | null;
  telefono?: string | null;
  celular?: string | null;
  actividad?: string | null;
  giro?: string | null;
  antiguedadNegocio?: string | null;
  ingresoMensual?: number | null;
}

export interface SolicitudPM extends SolicitudDomicilio {
  razonSocial?: string | null;
  rfc?: string | null;
  fechaConstitucion?: string | null;
  giro?: string | null;
  actividad?: string | null;
  sector?: string | null;
  numeroEscritura?: string | null;
  numeroNotaria?: string | null;
  notario?: string | null;
  ciudadNotaria?: string | null;
  capitalSocial?: number | null;
  email?: string | null;
  telefono?: string | null;
  ingresosAnuales?: number | null;
  numEmpleados?: number | null;
}

export interface SolicitudRepLegal {
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  rfc?: string | null;
  curp?: string | null;
  cargo?: string | null;
  email?: string | null;
  telefono?: string | null;
  numeroEscrituraPoder?: string | null;
  fechaEscrituraPoder?: string | null;
  numeroNotariaPoder?: string | null;
  notarioPoder?: string | null;
}

export interface SolicitudConyuge {
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  rfc?: string | null;
  curp?: string | null;
  ocupacion?: string | null;
  telefono?: string | null;
}

export interface SolicitudPerfilTransaccional {
  montoMensualOperaciones?: number | null;
  numeroOperacionesMensuales?: number | null;
  origenRecursos?: string | null;
  destinoRecursos?: string | null;
  operaComercioExterior?: boolean | null;
  paisesComercioExterior?: string | null;
  realizaDivisas?: boolean | null;
  realizaTransferenciasInternacionales?: boolean | null;
}

export interface SolicitudPEP {
  esPEP?: boolean | null;
  cargoPEP?: string | null;
  periodoPEP?: string | null;
  familiarPEP?: boolean | null;
  nombreFamiliarPEP?: string | null;
  parentescoPEP?: string | null;
  cargoFamiliarPEP?: string | null;
}

export interface SolicitudRefBancaria {
  banco?: string | null;
  tipoCuenta?: string | null;
  numeroCuenta?: string | null;
  antiguedad?: string | null;
}

export interface SolicitudRefComercial {
  nombre?: string | null;
  giro?: string | null;
  telefono?: string | null;
  email?: string | null;
  antiguedad?: string | null;
  lineaCredito?: number | null;
}

export interface SolicitudObligado {
  tipo?: TipoObligado | null;
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
  rfc?: string | null;
  curp?: string | null;
  fechaNacimiento?: string | null;
  email?: string | null;
  telefono?: string | null;
  relacion?: string | null;
  ingresoMensual?: number | null;
  ocupacion?: string | null;
}

/**
 * Shape completa que llega del endpoint /api/extract con tipo=SOLICITUD
 * y que el usuario edita en la vista de revisión.
 */
export interface SolicitudData {
  tipoSolicitante?: TipoSolicitante | null;
  operacion?: SolicitudOperacion | null;
  bien?: SolicitudBien | null;
  solicitantePFAE?: SolicitudPFAE | null;
  solicitantePM?: SolicitudPM | null;
  representanteLegal?: SolicitudRepLegal | null;
  conyuge?: SolicitudConyuge | null;
  perfilTransaccional?: SolicitudPerfilTransaccional | null;
  pep?: SolicitudPEP | null;
  referenciasBancarias?: SolicitudRefBancaria[] | null;
  referenciasComerciales?: SolicitudRefComercial[] | null;
  obligadosSolidarios?: SolicitudObligado[] | null;
}
