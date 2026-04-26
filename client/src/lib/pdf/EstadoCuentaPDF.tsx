/**
 * PDF Estado de Cuenta — Portal del Arrendatario (CLAUDE.md §9 T11)
 * ----------------------------------------------------------------
 * Resumen oficial del estado del contrato para que el cliente lo
 * descargue desde su portal. Comparte identidad visual con
 * CotizacionPDF / AmortizacionPDF (logo + razón social + footer
 * de contacto repetidos en cada página).
 *
 *   Sección 1: Datos del cliente y del contrato
 *   Sección 2: Resumen — total adeudado, próximo pago, vigencia
 *   Sección 3: Calendario de pagos con estatus por periodo
 *   Sección 4: Datos bancarios para depósito (CLABE)
 */
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import { colors, fmtMoneySigned } from './tokens';
import { getBranding } from '@/lib/branding';

const TITULO = 'ESTADO DE CUENTA';

// ────────────────────────────────────────────────────────────────────
// Tipos (matchean lo que devuelve GET /api/portal/:token/contract/:id)
// ────────────────────────────────────────────────────────────────────

export interface EstadoCuentaCliente {
  nombre: string;
  rfc: string | null;
  email?: string | null;
}

export interface EstadoCuentaContrato {
  folio: string;
  producto: string;
  plazo: number;
  tasaAnual: number;
  rentaMensual: number;
  rentaMensualIVA: number;
  fechaInicio: string | Date | null;
  fechaVencimiento: string | Date | null;
  estatus: string;
}

export interface EstadoCuentaPeriodo {
  periodo: number;
  fechaPago: string | Date;
  renta: number;
  ivaRenta: number;
  rentaPendiente: number;
  ivaPendiente: number;
  moratorio: number;
  ivaMoratorio: number;
  totalAdeudado: number;
  diasAtraso: number;
  estatus: 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';
}

export interface EstadoCuentaResumen {
  totalAdeudado: number;
  periodosVencidos: number;
  proximoPago: { periodo: number; fecha: string | Date; monto: number } | null;
}

export interface EstadoCuentaProps {
  cliente:   EstadoCuentaCliente;
  contrato:  EstadoCuentaContrato;
  resumen:   EstadoCuentaResumen;
  periodos:  EstadoCuentaPeriodo[];
  fechaCorte?: Date;            // default: ahora
}

// ────────────────────────────────────────────────────────────────────
// Helpers de formato (hacen el componente tolerante a strings ISO o Date)
// ────────────────────────────────────────────────────────────────────

function toDate(v: string | Date | null): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtFecha(v: string | Date | null): string {
  const d = toDate(v);
  if (!d) return '—';
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('-');
}

function fmtFechaLarga(d: Date): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

const ESTATUS_BG: Record<EstadoCuentaPeriodo['estatus'], string> = {
  PAGADO:    '#D1FAE5',
  PARCIAL:   '#DBEAFE',
  VENCIDO:   '#FEE2E2',
  PENDIENTE: '#FEF3C7',
  FUTURO:    '#F3F4F6',
};
const ESTATUS_FG: Record<EstadoCuentaPeriodo['estatus'], string> = {
  PAGADO:    '#065F46',
  PARCIAL:   '#1E40AF',
  VENCIDO:   '#991B1B',
  PENDIENTE: '#92400E',
  FUTURO:    '#374151',
};

// ────────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 64,
    paddingHorizontal: 28,
    fontSize: 8.5,
    color: colors.text,
    fontFamily: 'Helvetica',
  },

  // Header (repetido en cada página vía `fixed`)
  fechaWrap:  { alignItems: 'flex-end', marginBottom: 2 },
  fechaText:  { fontSize: 9 },
  logoWrap:   { alignItems: 'center', marginBottom: 4 },
  logo:       { width: 110, height: 70, objectFit: 'contain' },
  brandLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  titleLine:  { textAlign: 'center', fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 4, marginBottom: 4 },

  // Bloques de sección
  section: { marginTop: 8 },
  sectionTitle: {
    backgroundColor: colors.headerBg,
    color: colors.headerText,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  sectionBody: {
    borderWidth: 0.5,
    borderColor: colors.rowBorder,
    borderTopWidth: 0,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },

  // Grids dentro de secciones
  row2:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  cellL:   { width: '48%' },
  cellR:   { width: '48%' },
  label:   { fontSize: 8, color: colors.textMuted, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  value:   { fontSize: 9.5, marginTop: 1 },
  bigValue:{ fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  // Resumen (3 cuadros)
  summaryRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  summaryBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.rowBorder,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },

  // Tabla calendario
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.headerBg,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    color: colors.headerText,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  thRight:  { textAlign: 'right' },
  thCenter: { textAlign: 'center' },

  trow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.25,
    borderColor: colors.rowBorder,
  },
  trowAlt: { backgroundColor: colors.rowBand },
  td: { fontSize: 8 },
  tdRight:  { textAlign: 'right' },
  tdCenter: { textAlign: 'center' },

  // Anchos de columna del calendario
  colP:    { width: '7%' },
  colF:    { width: '14%' },
  colMon:  { width: '14%' },
  colIVA:  { width: '12%' },
  colMora: { width: '12%' },
  colTot:  { width: '14%' },
  colDias: { width: '10%' },
  colSt:   { width: '17%' },

  // Badges de estatus
  badge: {
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 2,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },

  // Footer fijo
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 28,
    right: 28,
    fontSize: 7.5,
    color: colors.textMuted,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderColor: colors.rowBorder,
    paddingTop: 4,
  },
  pageNum: { position: 'absolute', bottom: 6, right: 28, fontSize: 7, color: colors.textLight },
});

// ────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────

export function EstadoCuentaPDF({
  cliente, contrato, resumen, periodos, fechaCorte,
}: EstadoCuentaProps) {
  const corte = fechaCorte ?? new Date();
  const tasaPct = (contrato.tasaAnual * 100).toFixed(2) + '%';

  // Branding leído del singleton (cargado al boot por App.tsx).
  const branding = getBranding();
  const RAZON_SOCIAL = branding.empresa.razonSocial.toUpperCase();
  const CONTACTO = {
    direccion: branding.contacto.direccion,
    telefonos: `Teléfonos: ${branding.contacto.telefonos}`,
    email:     `E-mail: ${branding.contacto.email}`,
    web:       `Página web: ${branding.contacto.web}`,
  };
  const DATOS_BANCARIOS = {
    beneficiario: branding.banco.beneficiario,
    banco:        branding.banco.nombre,
    clabe:        branding.banco.clabe,
  };

  return (
    <Document
      title={`Estado de cuenta ${contrato.folio}`}
      author="Inyecta SOFOM"
      subject="Estado de cuenta del Portal del Arrendatario"
    >
      <Page size="LETTER" style={s.page}>
        {/* Header fijo */}
        <View fixed>
          <View style={s.fechaWrap}>
            <Text style={s.fechaText}>Fecha de emisión: {fmtFechaLarga(corte)}</Text>
          </View>
          <View style={s.logoWrap}>
            <Image src="/brand/logo-inyecta.png" style={s.logo} />
          </View>
          <Text style={s.brandLine}>{RAZON_SOCIAL}</Text>
          <Text style={s.titleLine}>{TITULO}</Text>
        </View>

        {/* Sección 1 — Cliente / Contrato */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>1. Datos del cliente y contrato</Text>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Cliente</Text>
                <Text style={s.value}>{cliente.nombre}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>RFC</Text>
                <Text style={s.value}>{cliente.rfc ?? '—'}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Folio del contrato</Text>
                <Text style={s.value}>{contrato.folio}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Producto</Text>
                <Text style={s.value}>Arrendamiento {contrato.producto}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Plazo</Text>
                <Text style={s.value}>{contrato.plazo} meses</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Tasa anual</Text>
                <Text style={s.value}>{tasaPct}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Inicio del arrendamiento</Text>
                <Text style={s.value}>{fmtFecha(contrato.fechaInicio)}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Vencimiento</Text>
                <Text style={s.value}>{fmtFecha(contrato.fechaVencimiento)}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Renta mensual (IVA inc.)</Text>
                <Text style={s.value}>{fmtMoneySigned(contrato.rentaMensualIVA)}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Estatus del contrato</Text>
                <Text style={s.value}>{contrato.estatus}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sección 2 — Resumen */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>2. Resumen al corte</Text>
          <View style={s.summaryRow}>
            <View style={s.summaryBox}>
              <Text style={s.label}>Total adeudado</Text>
              <Text style={[s.bigValue, { color: resumen.totalAdeudado > 0 ? '#991B1B' : '#065F46' }]}>
                {fmtMoneySigned(resumen.totalAdeudado)}
              </Text>
              <Text style={[s.label, { marginTop: 2 }]}>
                {resumen.periodosVencidos} {resumen.periodosVencidos === 1 ? 'periodo vencido' : 'periodos vencidos'}
              </Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.label}>Próximo pago</Text>
              {resumen.proximoPago ? (
                <>
                  <Text style={s.bigValue}>{fmtMoneySigned(resumen.proximoPago.monto)}</Text>
                  <Text style={[s.label, { marginTop: 2 }]}>
                    Periodo {resumen.proximoPago.periodo} — {fmtFecha(resumen.proximoPago.fecha)}
                  </Text>
                </>
              ) : (
                <Text style={[s.bigValue, { color: '#065F46' }]}>Al corriente</Text>
              )}
            </View>
            <View style={s.summaryBox}>
              <Text style={s.label}>Vigencia</Text>
              <Text style={s.value}>{fmtFecha(contrato.fechaInicio)}</Text>
              <Text style={[s.label, { marginTop: 2 }]}>al</Text>
              <Text style={s.value}>{fmtFecha(contrato.fechaVencimiento)}</Text>
            </View>
          </View>
        </View>

        {/* Sección 3 — Calendario */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>3. Calendario de pagos</Text>
        </View>
        <View style={s.tableHead} fixed>
          <Text style={[s.th, s.thCenter, s.colP]}>#</Text>
          <Text style={[s.th, s.colF]}>Vencimiento</Text>
          <Text style={[s.th, s.thRight, s.colMon]}>Renta</Text>
          <Text style={[s.th, s.thRight, s.colIVA]}>IVA</Text>
          <Text style={[s.th, s.thRight, s.colMora]}>Moratorio</Text>
          <Text style={[s.th, s.thRight, s.colTot]}>Por pagar</Text>
          <Text style={[s.th, s.thCenter, s.colDias]}>Atraso</Text>
          <Text style={[s.th, s.thCenter, s.colSt]}>Estatus</Text>
        </View>

        {periodos.map((p, i) => {
          const moraTotal = p.moratorio + p.ivaMoratorio;
          return (
            <View key={p.periodo} style={[s.trow, i % 2 === 1 ? s.trowAlt : {}]} wrap={false}>
              <Text style={[s.td, s.tdCenter, s.colP]}>{p.periodo}</Text>
              <Text style={[s.td, s.colF]}>{fmtFecha(p.fechaPago)}</Text>
              <Text style={[s.td, s.tdRight, s.colMon]}>{fmtMoneySigned(p.renta)}</Text>
              <Text style={[s.td, s.tdRight, s.colIVA]}>{fmtMoneySigned(p.ivaRenta)}</Text>
              <Text style={[s.td, s.tdRight, s.colMora]}>
                {moraTotal > 0 ? fmtMoneySigned(moraTotal) : '—'}
              </Text>
              <Text style={[s.td, s.tdRight, s.colTot, { fontFamily: 'Helvetica-Bold' }]}>
                {p.totalAdeudado > 0 ? fmtMoneySigned(p.totalAdeudado) : '—'}
              </Text>
              <Text style={[s.td, s.tdCenter, s.colDias]}>
                {p.diasAtraso > 0 ? `${p.diasAtraso} d` : '—'}
              </Text>
              <View style={s.colSt}>
                <Text style={[s.badge, { backgroundColor: ESTATUS_BG[p.estatus], color: ESTATUS_FG[p.estatus] }]}>
                  {p.estatus}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Sección 4 — Datos bancarios */}
        <View style={s.section} wrap={false}>
          <Text style={s.sectionTitle}>4. Datos para depósito o transferencia</Text>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Beneficiario</Text>
                <Text style={s.value}>{DATOS_BANCARIOS.beneficiario}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Banco</Text>
                <Text style={s.value}>{DATOS_BANCARIOS.banco}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>CLABE interbancaria</Text>
                <Text style={[s.value, { fontFamily: 'Helvetica-Bold' }]}>{DATOS_BANCARIOS.clabe}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Referencia</Text>
                <Text style={s.value}>Folio del contrato: {contrato.folio}</Text>
              </View>
            </View>
            <Text style={[s.label, { marginTop: 4 }]}>
              Su pago se reflejará en el portal en máximo 24 horas hábiles.
            </Text>
          </View>
        </View>

        {/* Footer fijo */}
        <View style={s.footer} fixed>
          <Text>{CONTACTO.direccion}</Text>
          <Text>{CONTACTO.telefonos} · {CONTACTO.email} · {CONTACTO.web}</Text>
        </View>
        <Text
          style={s.pageNum}
          fixed
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
