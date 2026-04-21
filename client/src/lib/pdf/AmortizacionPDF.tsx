/**
 * PDF de Tabla de Amortización — Inyecta Arrendamiento
 * ----------------------------------------------------------
 * Mantiene la misma identidad visual de CotizacionPDF
 * (logo centrado + razón social + título), seguido de tabla
 * de amortización con encabezado de columnas que se repite
 * en cada página.
 *
 *   PURO:       Periodo / Fecha / Renta / IVA / Total
 *   FINANCIERO: Periodo / Fecha / Capital / Interés / IVA / Pago / Saldo
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors, fmtMoney, fmtMoneySigned, fmtPct } from './tokens';
import type { ResultadoCotizacion } from '../cotizacion/calculos';
import type { FilaAmortPuro, FilaAmortFinanciero } from '../cotizacion/amortizacion';

const RAZON_SOCIAL = 'FSMP SOLUCIONES DE CAPITAL, S.A. DE C.V., SOFOM, E.N.R.';
const TITULO       = 'TABLA DE AMORTIZACIÓN';

const CONTACTO = {
  direccion: 'Av. Sierra Vista 1305, Piso 4 Oficina 7, Col. Lomas del Tecnológico, C.P. 78215, San Luis Potosí, S.L.P.',
  telefonos: 'Teléfonos: 444-521-7204 / 444-521-6980',
  email:     'E-mail: contacto@inyecta.com.mx',
  web:       'Página web: www.inyecta.com.mx',
};

// ────────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 56,
    paddingHorizontal: 28,
    fontSize: 8.5,
    color: colors.text,
    fontFamily: 'Helvetica',
  },

  // ── Header ──────────────────────────────────────────────────
  fechaWrap:  { alignItems: 'flex-end', marginBottom: 2 },
  fechaText:  { fontSize: 9 },
  logoWrap:   { alignItems: 'center', marginBottom: 4 },
  logo:       { width: 80, height: 56, objectFit: 'contain' },
  brandLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  titleLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1, marginBottom: 6 },

  // ── Sub-header con datos cliente / contrato ─────────────────
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#000000',
    marginBottom: 6,
  },
  subHeaderItem: { flexDirection: 'row', gap: 4, fontSize: 8.5 },
  subHeaderLabel:{ fontFamily: 'Helvetica-Bold' },

  // ── Tabla ──────────────────────────────────────────────────
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

  row: {
    flexDirection: 'row',
    paddingVertical: 2.8,
    paddingHorizontal: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: '#9BB6C8',
  },
  rowBand: { backgroundColor: colors.rowBand },
  td:       { fontSize: 8 },
  tdRight:  { textAlign: 'right' },
  tdCenter: { textAlign: 'center' },
  tdMuted:  { color: colors.textMuted },

  rowTotal: {
    flexDirection: 'row',
    backgroundColor: colors.totalBg,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tdTotal: { fontSize: 8, color: colors.totalText, fontFamily: 'Helvetica-Bold' },
  tdTotalRight: { textAlign: 'right' },

  // ── Footer ──────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    borderTopWidth: 0.5,
    borderTopColor: '#000000',
    paddingTop: 4,
  },
  footerText: { fontSize: 7.2, color: colors.text, lineHeight: 1.25 },
  footerRight: { fontSize: 7.2, color: colors.text, textAlign: 'right' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
});

// ────────────────────────────────────────────────────────────────────
// Anchos de columnas
// ────────────────────────────────────────────────────────────────────

const colsPuro = {
  periodo: '8%', fecha: '20%', renta: '24%', iva: '24%', total: '24%',
} as const;

const colsFin = {
  periodo: '6%', fecha: '12%', capital: '15%', interes: '15%',
  iva: '13%', total: '17%', saldo: '22%',
} as const;

// ────────────────────────────────────────────────────────────────────
// Header reutilizable (fijo en todas las páginas)
// ────────────────────────────────────────────────────────────────────

function PdfHeader({
  data, tasaAnual, logoUrl, folio,
}: {
  data: ResultadoCotizacion; tasaAnual: number; logoUrl: string; folio?: string;
}) {
  return (
    <View fixed>
      <View style={s.fechaWrap}>
        <Text style={s.fechaText}>Fecha: {data.fecha}</Text>
      </View>
      <View style={s.logoWrap}>
        {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
      </View>
      <Text style={s.brandLine}>{RAZON_SOCIAL}</Text>
      <Text style={s.titleLine}>
        {TITULO} — {data.producto === 'PURO' ? 'ARRENDAMIENTO PURO' : 'ARRENDAMIENTO FINANCIERO'}
      </Text>

      <View style={s.subHeader}>
        <View style={s.subHeaderItem}>
          <Text style={s.subHeaderLabel}>Cliente:</Text>
          <Text>{data.nombreCliente || '—'}</Text>
        </View>
        <View style={s.subHeaderItem}>
          <Text style={s.subHeaderLabel}>Plazo:</Text>
          <Text>{data.plazo} meses</Text>
        </View>
        <View style={s.subHeaderItem}>
          <Text style={s.subHeaderLabel}>Tasa anual:</Text>
          <Text>{fmtPct(tasaAnual)}</Text>
        </View>
        <View style={s.subHeaderItem}>
          <Text style={s.subHeaderLabel}>Renta c/IVA:</Text>
          <Text>{fmtMoneySigned(data.rentaMensual.total)}</Text>
        </View>
        {folio && (
          <View style={s.subHeaderItem}>
            <Text style={s.subHeaderLabel}>Folio:</Text>
            <Text>{folio}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PdfFooter() {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.footerText}>{CONTACTO.direccion}</Text>
          <Text style={s.footerText}>{CONTACTO.telefonos}  ·  {CONTACTO.email}  ·  {CONTACTO.web}</Text>
        </View>
        <Text
          style={s.footerRight}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Encabezados de columnas (se repiten en cada página)
// ────────────────────────────────────────────────────────────────────

function HeadPuro() {
  return (
    <View style={s.tableHead} fixed>
      <Text style={[s.th, s.thCenter, { width: colsPuro.periodo }]}>#</Text>
      <Text style={[s.th, s.thCenter, { width: colsPuro.fecha }]}>Fecha</Text>
      <Text style={[s.th, s.thRight,  { width: colsPuro.renta }]}>Renta</Text>
      <Text style={[s.th, s.thRight,  { width: colsPuro.iva }]}>IVA</Text>
      <Text style={[s.th, s.thRight,  { width: colsPuro.total }]}>Total a pagar</Text>
    </View>
  );
}

function HeadFin() {
  return (
    <View style={s.tableHead} fixed>
      <Text style={[s.th, s.thCenter, { width: colsFin.periodo }]}>#</Text>
      <Text style={[s.th, s.thCenter, { width: colsFin.fecha }]}>Fecha</Text>
      <Text style={[s.th, s.thRight,  { width: colsFin.capital }]}>Capital</Text>
      <Text style={[s.th, s.thRight,  { width: colsFin.interes }]}>Interés</Text>
      <Text style={[s.th, s.thRight,  { width: colsFin.iva }]}>IVA</Text>
      <Text style={[s.th, s.thRight,  { width: colsFin.total }]}>Pago total</Text>
      <Text style={[s.th, s.thRight,  { width: colsFin.saldo }]}>Saldo insoluto</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Cuerpos de tabla
// ────────────────────────────────────────────────────────────────────

function BodyPuro({ filas }: { filas: FilaAmortPuro[] }) {
  const totalRenta = filas.reduce((a, r) => a + r.renta, 0);
  const totalIVA   = filas.reduce((a, r) => a + r.iva,   0);
  const totalGran  = filas.reduce((a, r) => a + r.total, 0);

  return (
    <>
      {filas.map((r, i) => (
        // @react-pdf/renderer tipa style como Style|Style[]; ni boolean ni
        // null son asignables a Style. Usamos spread condicional para
        // mantener el arreglo homogéneo de Style.
        <View key={r.periodo} style={[s.row, ...(i % 2 === 0 ? [s.rowBand] : [])]} wrap={false}>
          <Text style={[s.td, s.tdCenter, { width: colsPuro.periodo }]}>{r.periodo}</Text>
          <Text style={[s.td, s.tdCenter, s.tdMuted, { width: colsPuro.fecha }]}>{r.fecha}</Text>
          <Text style={[s.td, s.tdRight, { width: colsPuro.renta }]}>{fmtMoneySigned(r.renta)}</Text>
          <Text style={[s.td, s.tdRight, s.tdMuted, { width: colsPuro.iva }]}>{fmtMoneySigned(r.iva)}</Text>
          <Text style={[s.td, s.tdRight, { width: colsPuro.total, fontFamily: 'Helvetica-Bold' }]}>
            {fmtMoneySigned(r.total)}
          </Text>
        </View>
      ))}

      <View style={s.rowTotal} wrap={false}>
        <Text style={[s.tdTotal, s.tdCenter, { width: colsPuro.periodo }]}></Text>
        <Text style={[s.tdTotal, s.tdRight,  { width: colsPuro.fecha }]}>TOTALES</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsPuro.renta }]}>${fmtMoney(totalRenta)}</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsPuro.iva }]}>${fmtMoney(totalIVA)}</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsPuro.total }]}>${fmtMoney(totalGran)}</Text>
      </View>
    </>
  );
}

function BodyFin({ filas }: { filas: FilaAmortFinanciero[] }) {
  const totalCap   = filas.reduce((a, r) => a + r.capital, 0);
  const totalInt   = filas.reduce((a, r) => a + r.interes, 0);
  const totalIVA   = filas.reduce((a, r) => a + r.iva, 0);
  const totalGran  = filas.reduce((a, r) => a + r.total, 0);

  return (
    <>
      {filas.map((r, i) => (
        <View key={r.periodo} style={[s.row, ...(i % 2 === 0 ? [s.rowBand] : [])]} wrap={false}>
          <Text style={[s.td, s.tdCenter, { width: colsFin.periodo }]}>{r.periodo}</Text>
          <Text style={[s.td, s.tdCenter, s.tdMuted, { width: colsFin.fecha }]}>{r.fecha}</Text>
          <Text style={[s.td, s.tdRight, { width: colsFin.capital }]}>{fmtMoneySigned(r.capital)}</Text>
          <Text style={[s.td, s.tdRight, { width: colsFin.interes }]}>{fmtMoneySigned(r.interes)}</Text>
          <Text style={[s.td, s.tdRight, s.tdMuted, { width: colsFin.iva }]}>{fmtMoneySigned(r.iva)}</Text>
          <Text style={[s.td, s.tdRight, { width: colsFin.total, fontFamily: 'Helvetica-Bold' }]}>
            {fmtMoneySigned(r.total)}
          </Text>
          <Text style={[s.td, s.tdRight, s.tdMuted, { width: colsFin.saldo }]}>{fmtMoneySigned(r.saldo)}</Text>
        </View>
      ))}

      <View style={s.rowTotal} wrap={false}>
        <Text style={[s.tdTotal, s.tdCenter, { width: colsFin.periodo }]}></Text>
        <Text style={[s.tdTotal, s.tdRight,  { width: colsFin.fecha }]}>TOTALES</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsFin.capital }]}>${fmtMoney(totalCap)}</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsFin.interes }]}>${fmtMoney(totalInt)}</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsFin.iva }]}>${fmtMoney(totalIVA)}</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsFin.total }]}>${fmtMoney(totalGran)}</Text>
        <Text style={[s.tdTotal, s.tdTotalRight, { width: colsFin.saldo }]}>—</Text>
      </View>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Documento
// ────────────────────────────────────────────────────────────────────

interface Props {
  data: ResultadoCotizacion;
  tasaAnual: number;
  filasPuro?: FilaAmortPuro[];
  filasFinanciero?: FilaAmortFinanciero[];
  logoUrl?: string;
  folio?: string;
}

export function AmortizacionPDF({
  data,
  tasaAnual,
  filasPuro,
  filasFinanciero,
  logoUrl = '/brand/logo-inyecta.png',
  folio,
}: Props) {
  const isFin = data.producto === 'FINANCIERO';

  return (
    <Document
      title={`Amortización ${data.nombreCliente}`}
      author="FSMP Soluciones de Capital · Inyecta"
      subject={`${TITULO} ${data.producto}`}
      creator="Inyecta Arrendamiento"
    >
      <Page size="LETTER" orientation={isFin ? 'landscape' : 'portrait'} style={s.page}>
        <PdfHeader data={data} tasaAnual={tasaAnual} logoUrl={logoUrl} folio={folio} />

        {isFin && filasFinanciero ? (
          <>
            <HeadFin />
            <BodyFin filas={filasFinanciero} />
          </>
        ) : filasPuro ? (
          <>
            <HeadPuro />
            <BodyPuro filas={filasPuro} />
          </>
        ) : (
          <Text>Sin filas de amortización para mostrar.</Text>
        )}

        <PdfFooter />
      </Page>
    </Document>
  );
}

export default AmortizacionPDF;
