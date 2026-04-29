/**
 * Tipos compartidos para los PDFs de contrato (PURO/FIN), pagaré,
 * acta de entrega y carátula. Definidos aparte para mantener los
 * componentes <Document> enfocados en presentación.
 *
 * El shape coincide 1:1 con lo que devuelve `GET /api/contracts/:id`
 * + las relaciones extendidas (`avales`, `pagare`, `proveedorData`).
 * El adapter `mapContractPdfProps` (en el mismo módulo) acepta el
 * objeto crudo del backend y devuelve este shape — los PDFs nunca
 * tocan tipos de Prisma.
 */

export type TipoCliente = 'PFAE' | 'PM';
export type Producto = 'PURO' | 'FINANCIERO';

export interface PdfDireccion {
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  pais?: string | null;
  cp?: string | null;
}

export interface PdfRepresentanteLegal {
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  rfc?: string | null;
  curp?: string | null;
  estadoCivil?: 'SOLTERO' | 'CASADO' | null;
  regimenMatrimonial?: 'SEPARACION_BIENES' | 'SOCIEDAD_CONYUGAL' | null;
  nombreConyuge?: string | null;
  // Inscripción de poderes (declaración II-B)
  fechaInscripcionPoderes?: string | Date | null;
  folioInscripcionPoderes?: string | null;
  poderEscrituraNumero?: string | null;
  poderEscrituraFecha?: string | Date | null;
  poderNotarioNombre?: string | null;
  poderNotarioNumero?: string | null;
  poderNotarioLugar?: string | null;
}

export interface PdfClient {
  tipo: TipoCliente;
  // PFAE
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  curp?: string | null;
  // PM
  razonSocial?: string | null;
  fechaConstitucion?: string | Date | null;
  folioMercantil?: string | null;
  notarioConstNombre?: string | null;
  notarioConstNumero?: string | null;
  notarioConstLugar?: string | null;
  actaConstitutiva?: string | null;   // numero de escritura constitutiva (texto libre)
  // Compartido
  rfc?: string | null;
  email?: string | null;
  telefono?: string | null;
  // Domicilio fiscal
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  pais?: string | null;
  cp?: string | null;
  representanteLegalData?: PdfRepresentanteLegal | null;
}

export interface PdfAval {
  orden: number;
  tipo: TipoCliente;
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  rfc?: string | null;
  curp?: string | null;
  fechaNacimiento?: string | Date | null;
  estadoCivil?: 'SOLTERO' | 'CASADO' | null;
  regimenMatrimonial?: 'SEPARACION_BIENES' | 'SOCIEDAD_CONYUGAL' | null;
  nombreConyuge?: string | null;
  rfcConyuge?: string | null;
  // Domicilio
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  pais?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  // Si el aval es PM
  razonSocial?: string | null;
  fechaConstitucion?: string | Date | null;
  folioMercantil?: string | null;
  notarioConstNombre?: string | null;
  notarioConstNumero?: string | null;
  notarioConstLugar?: string | null;
  repLegalNombre?: string | null;
  repLegalRfc?: string | null;
  poderEscrituraNumero?: string | null;
  poderEscrituraFecha?: string | Date | null;
  poderNotarioNombre?: string | null;
}

export interface PdfProveedor {
  nombre: string;
  rfc?: string | null;
  nombreContacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  // Domicilio
  calle?: string | null;
  numExterior?: string | null;
  numInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  banco?: string | null;
  clabe?: string | null;
  numCuenta?: string | null;
}

export interface PdfPagare {
  numeroPagare: string;
  fechaSuscripcion: string | Date;
  fechaVencimiento: string | Date;
  montoPagare: number;
  lugarSuscripcion?: string | null;
}

export interface PdfContract {
  id: string;
  folio: string;            // ARR-NNN-YYYY
  producto: Producto;
  // Datos del bien
  bienDescripcion: string;
  bienMarca?: string | null;
  bienModelo?: string | null;
  bienAnio?: number | null;
  bienNumSerie?: string | null;
  bienEstado?: string | null;
  bienColor?: string | null;
  bienPlacas?: string | null;
  bienNIV?: string | null;
  bienMotor?: string | null;
  lugarEntregaBien?: string | null;
  // Financieros (todos en MXN, ya convertidos a number desde Decimal)
  valorBien: number;
  valorBienIVA: number;
  plazo: number;
  tasaAnual: number;
  tasaMoratoria?: number | null;
  enganche: number;
  depositoGarantia: number;
  comisionApertura: number;
  rentaInicial: number;
  gpsInstalacion: number;
  seguroAnual: number;
  valorResidual: number;
  montoFinanciar: number;
  rentaMensual: number;
  rentaMensualIVA: number;
  // Fechas
  fechaFirma?: string | Date | null;
  fechaInicio?: string | Date | null;
  fechaEntregaBien?: string | Date | null;
  fechaVencimiento?: string | Date | null;
  diaPagoMensual?: number | null;
}

export interface ContractPdfProps {
  contract: PdfContract;
  client: PdfClient;
  avales: PdfAval[];
  proveedor?: PdfProveedor | null;   // sólo FIN
  pagare?: PdfPagare | null;         // sólo FIN
  folioCondusef?: string | null;     // del Catalog (Catalog.folioCondusef{Puro,Fin})
}

// ── Helpers de presentación (puros, sin React) ───────────────────

export function nombreClienteCompleto(c: PdfClient): string {
  if (c.tipo === 'PM') return c.razonSocial || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ').trim();
}

export function nombreAvalCompleto(a: PdfAval): string {
  if (a.tipo === 'PM') return a.razonSocial || '';
  return [a.nombre, a.apellidoPaterno, a.apellidoMaterno].filter(Boolean).join(' ').trim();
}

export function direccionUnaLinea(d: PdfDireccion | null | undefined): string {
  if (!d) return '';
  const calle = [d.calle, d.numExterior].filter(Boolean).join(' ');
  const interior = d.numInterior ? `Int. ${d.numInterior}` : '';
  const piso = [calle, interior].filter(Boolean).join(', ');
  const ciudad = [d.colonia, d.cp ? `C.P. ${d.cp}` : '', d.municipio || d.ciudad, d.estado].filter(Boolean).join(', ');
  return [piso, ciudad].filter(Boolean).join(', ');
}

export function fmtFechaLarga(d: string | Date | null | undefined): string {
  if (!d) return '__________';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '__________';
  const dia = date.getDate();
  const mes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][date.getMonth()];
  return `${dia} de ${mes} de ${date.getFullYear()}`;
}

export function fmtFechaCorta(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Convierte un número a su representación textual en español (sin decimales).
 *  Acepta enteros 0..999_999. Para fechas, plazos, porcentajes, cláusulas etc.
 *  No es un servicio de banking-grade — para "monto en letras" complejo
 *  usamos `numeroALetras` de ReciboPDF. */
export function numeroALetraSimple(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 0 || n >= 1_000_000) return String(n);
  const u = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE'];
  const d10_19 = (x: number) => x === 16 ? 'DIECISÉIS' : x === 17 ? 'DIECISIETE' : x === 18 ? 'DIECIOCHO' : x === 19 ? 'DIECINUEVE' : '';
  const d = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const c = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];

  const decenas = (x: number): string => {
    if (x <= 15) return u[x];
    if (x >= 16 && x <= 19) return d10_19(x);
    if (x === 20) return 'VEINTE';
    if (x < 30) return 'VEINTI' + u[x - 20].toLowerCase().toUpperCase();
    const dec = Math.floor(x / 10);
    const uni = x % 10;
    return uni === 0 ? d[dec] : `${d[dec]} Y ${u[uni]}`;
  };

  const centenas = (x: number): string => {
    if (x === 100) return 'CIEN';
    const cen = Math.floor(x / 100);
    const rest = x % 100;
    return `${c[cen]}${rest > 0 ? ' ' + decenas(rest) : ''}`.trim();
  };

  if (n < 100) return decenas(n);
  if (n < 1000) return centenas(n);
  // miles
  const miles = Math.floor(n / 1000);
  const rest = n % 1000;
  const milesText = miles === 1 ? 'MIL' : `${centenas(miles)} MIL`;
  return rest === 0 ? milesText : `${milesText} ${centenas(rest)}`;
}
