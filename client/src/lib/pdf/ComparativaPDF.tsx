/**
 * PDF de Cotización COMPARATIVA — Inyecta Arrendamiento
 * ----------------------------------------------------------
 * RÉPLICA FIEL del CotizacionPDF original, pero comparando 3 plazos en
 * columnas (las elige el operador, default 24/36/48). Mismo header, mismos
 * datos generales (sin la fila "Plazo", que ahora vive en las columnas),
 * las MISMAS 4 secciones con TODAS sus filas (Monto a financiar / Pago
 * inicial / Renta mensual / Valor de rescate u Opción de compra) y el mismo
 * footer. La única diferencia respecto a la cotización individual es que
 * cada fila y cada TOTAL muestran un valor por plazo en su columna.
 *
 * Los montos vienen del MISMO motor verificado al centavo
 * (calcularCotizacion), así que la columna de N meses coincide EXACTAMENTE
 * con la cotización individual a N meses. Las filas plazo-independientes
 * (monto a financiar, pago inicial, rescate) muestran el mismo número en
 * las 3 columnas — confirma visualmente que no cambian con el plazo; sólo
 * la renta mensual varía.
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors, fmtMoney, fmtMoneySigned } from './tokens';
import type { ResultadoCotizacion } from '../cotizacion/calculos';
import { getBranding } from '@/lib/branding';

const TITULO = 'COTIZACIÓN ARRENDAMIENTO — COMPARATIVA DE PLAZOS';

/** Notas legales del Excel original (idénticas a CotizacionPDF). */
function notasLegales(razonSocial: string): string[] {
  return [
    `Los seguros de los equipos arrendados podrán ser contratados con su aseguradora en forma multianual, con cobertura amplia contra el riesgo que este expuesto el bien objeto del arrendamiento, con endoso preferente e irrevocable a favor de ${razonSocial}.`,
    'La arrendataria deberá cubrir los gastos de mantenimiento, trámites y cualquier otro gasto relacionado con el bien objeto del arrendamiento.',
    'Los vencimientos de las rentas serán mensuales según fecha acordada.',
    `La presente cotización es de carácter informativo, por lo cual no presenta ningún compromiso para ${razonSocial} y estará sujeta a la autorización del comité de crédito.`,
    'El IVA del interés de las rentas mensuales se calcula de acuerdo a lo establecido en el Artículo 18-A de LIVA',
  ];
}

// Proporciones de columna: etiqueta + N columnas de valor (alineadas entre
// el encabezado de plazos, todas las filas y los totales).
const FLEX_LABEL = 2.2;
const FLEX_CELL = 1;

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 168,        // espacio reservado para footer fijo
    paddingHorizontal: 36,
    fontSize: 8.5,
    color: colors.text,
    fontFamily: 'Helvetica',
  },

  // ── Header (idéntico a CotizacionPDF) ──────────────────────
  fechaWrap:  { alignItems: 'flex-end', marginBottom: 2 },
  fechaText:  { fontSize: 9 },
  logoWrap:   { alignItems: 'center', marginVertical: 2 },
  logo:       { width: 150, height: 100, objectFit: 'contain' },
  brandLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  titleLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1, marginBottom: 6 },

  // ── Bloque datos generales (idéntico a CotizacionPDF) ──────
  dataRow:      { flexDirection: 'row', paddingVertical: 3, gap: 12 },
  dataCol:      { flexDirection: 'row', flex: 1, alignItems: 'flex-end', gap: 6 },
  dataLabel:    { width: 86, fontSize: 8.5, color: colors.text },
  dataValueBox: { flex: 1, borderBottomWidth: 0.5, borderBottomColor: '#000000', paddingBottom: 1, minHeight: 11 },
  dataValue:    { fontSize: 8.5, color: colors.text },

  // ── Encabezado de columnas (plazos) ────────────────────────
  colHeadRow:   { flexDirection: 'row', backgroundColor: colors.totalBg, paddingVertical: 3, paddingHorizontal: 6, marginTop: 6 },
  colHeadLabel: { flex: FLEX_LABEL, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },
  colHeadCell:  { flex: FLEX_CELL, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText, textAlign: 'right' },

  // ── Secciones (idéntico look a CotizacionPDF) ──────────────
  section:      { marginTop: 6 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#000000', marginBottom: 1 },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.4,
    borderBottomColor: '#9BB6C8',
  },
  rowBand:    { backgroundColor: colors.rowBand },
  rowWhite:   { backgroundColor: '#FFFFFF' },
  cellLabel:  { flex: FLEX_LABEL, fontSize: 8.5, color: colors.text },
  cellAmount: { flex: FLEX_CELL, fontSize: 8.5, color: colors.text, textAlign: 'right' },

  rowTotal:      { flexDirection: 'row', backgroundColor: colors.totalBg, paddingVertical: 3, paddingHorizontal: 6 },
  rowTotalLabel: { flex: FLEX_LABEL, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },
  rowTotalCell:  { flex: FLEX_CELL, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText, textAlign: 'right' },

  // ── Footer (idéntico a CotizacionPDF) ──────────────────────
  footer:      { position: 'absolute', bottom: 16, left: 36, right: 36 },
  notas:       { marginBottom: 6 },
  notaText:    { fontSize: 7, color: colors.text, marginBottom: 1.2, lineHeight: 1.22 },
  contactoBox: { borderTopWidth: 0.5, borderTopColor: '#000000', paddingTop: 3 },
  contactoText:{ fontSize: 7, color: colors.text, lineHeight: 1.22 },
});

// ────────────────────────────────────────────────────────────────────
// Sub-componentes (versión multi-columna de los de CotizacionPDF)
// ────────────────────────────────────────────────────────────────────

function DataLine({
  leftLabel, leftValue, rightLabel, rightValue,
}: {
  leftLabel: string; leftValue: string;
  rightLabel?: string; rightValue?: string;
}) {
  return (
    <View style={s.dataRow}>
      <View style={s.dataCol}>
        <Text style={s.dataLabel}>{leftLabel}</Text>
        <View style={s.dataValueBox}><Text style={s.dataValue}>{leftValue}</Text></View>
      </View>
      <View style={s.dataCol}>
        {rightLabel ? (
          <>
            <Text style={s.dataLabel}>{rightLabel}</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>{rightValue}</Text></View>
          </>
        ) : <View style={{ flex: 1 }} />}
      </View>
    </View>
  );
}

/** Fila de concepto con un valor por columna (= TableLine pero multi-plazo). */
function TableLine({
  label, values, alt, isPercent,
}: {
  label: string; values: number[]; alt: boolean; isPercent?: boolean;
}) {
  return (
    <View style={[s.tableRow, alt ? s.rowBand : s.rowWhite]}>
      <Text style={s.cellLabel}>{label}</Text>
      {values.map((v, i) => (
        <Text key={i} style={s.cellAmount}>
          {isPercent ? (v * 100).toFixed(2) + '%' : fmtMoneySigned(v)}
        </Text>
      ))}
    </View>
  );
}

/** Fila TOTAL (fondo azul) con un total por columna. */
function TotalLine({ values }: { values: number[] }) {
  return (
    <View style={s.rowTotal}>
      <Text style={s.rowTotalLabel}>TOTAL</Text>
      {values.map((v, i) => (
        <Text key={i} style={s.rowTotalCell}>${fmtMoney(v)}</Text>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Documento principal
// ────────────────────────────────────────────────────────────────────

interface ColumnaCot {
  plazo: number;
  cot: ResultadoCotizacion;
}

interface Props {
  /** 3 cotizaciones del mismo bien a distintos plazos (orden = columnas). */
  cotizaciones: ColumnaCot[];
  /** Tasa anual (conservado por compat; no se renderiza, igual que el original). */
  tasaAnual?: number;
  /** Enganche % (conservado por compat; no se renderiza). */
  enganchePct?: number;
  logoUrl?: string;
}

export function ComparativaPDF({
  cotizaciones,
  logoUrl = '/brand/logo-inyecta.png',
}: Props) {
  const brand = getBranding();
  const RAZON_SOCIAL = brand.empresa.razonSocial.toUpperCase(); // espejo de CotizacionPDF
  const NOTAS = notasLegales(RAZON_SOCIAL);

  const base = cotizaciones[0]?.cot;
  const productoLabel = base?.producto === 'PURO' ? 'Puro' : 'Financiero';
  const seccion4Label = base?.producto === 'PURO' ? 'Valor de rescate' : 'Opción de compra';

  // Helper: extrae un valor por columna aplicando `pick` al cot de cada plazo.
  const col = (pick: (c: ResultadoCotizacion) => number) =>
    cotizaciones.map((x) => pick(x.cot));

  return (
    <Document
      title={`Comparativa ${base?.nombreCliente ?? ''}`}
      author={`${brand.empresa.razonSocial} · ${brand.empresa.nombreComercial}`}
      subject={`${TITULO} · ${productoLabel}`}
      creator={`${brand.empresa.nombreComercial} Arrendamiento`}
    >
      <Page size="LETTER" style={s.page}>
        {/* ── Fecha ─────────────────────────────────────────── */}
        <View style={s.fechaWrap} fixed>
          <Text style={s.fechaText}>Fecha: {base?.fecha}</Text>
        </View>

        {/* ── Logo + razón social + título ──────────────────── */}
        <View fixed>
          <View style={s.logoWrap}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
          </View>
          <Text style={s.brandLine}>{RAZON_SOCIAL}</Text>
          <Text style={s.titleLine}>{TITULO}</Text>
        </View>

        {/* ── Datos generales (idénticos al original, sin "Plazo") ── */}
        <DataLine
          leftLabel="Nombre del cliente"
          leftValue={base?.nombreCliente || ''}
        />
        <DataLine
          leftLabel="Valor del bien"
          leftValue={fmtMoneySigned(base?.valorBienConIVA ?? 0)}
          rightLabel="Bien arrendado"
          rightValue={base?.nombreBien || ''}
        />
        <DataLine
          leftLabel="Producto"
          leftValue={productoLabel}
          rightLabel="Estado del bien"
          rightValue={base?.estadoBien || ''}
        />
        <DataLine
          leftLabel="Seguro"
          leftValue={base?.seguroEstado || ''}
        />

        {/* ── Encabezado de columnas: los plazos ────────────── */}
        <View style={s.colHeadRow}>
          <Text style={s.colHeadLabel}>Concepto</Text>
          {cotizaciones.map((c, i) => (
            <Text key={i} style={s.colHeadCell}>{c.plazo} meses</Text>
          ))}
        </View>

        {/* ── Sección 1: Monto a financiar ──────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Monto a financiar</Text>
          <TableLine label="Valor del bien"                      values={col((c) => c.valorBienSinIVA)}              alt />
          <TableLine label="Valor del bien con IVA (+)"           values={col((c) => c.monto.valorBienConIVA)}        alt={false} />
          <TableLine label="Comisión por apertura financiada (+)" values={col((c) => c.monto.comisionAperturaFinanciada)} alt />
          <TableLine label="Seguro del bien (+)"                  values={col((c) => c.monto.seguroFinanciado)}       alt={false} />
          <TableLine label="Instalación del GPS financiada (+)"   values={col((c) => c.monto.gpsFinanciado)}          alt />
          <TotalLine values={col((c) => c.monto.total)} />
        </View>

        {/* ── Sección 2: Pago inicial ───────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Pago inicial</Text>
          <TableLine label="Pago anticipado (con IVA)"               values={col((c) => c.pagoInicial.engancheContado + c.pagoInicial.ivaEnganche)} alt />
          <TableLine label="Comisión por apertura contado (con IVA)" values={col((c) => c.pagoInicial.comisionAperturaContado + c.pagoInicial.ivaComisionContado)} alt={false} />
          <TableLine label="Apertura de seguro"                      values={col((c) => c.pagoInicial.aperturaSeguros)}  alt />
          <TableLine label="Depósito en garantía"                    values={col((c) => c.pagoInicial.depositoGarantia)} alt={false} />
          <TableLine label="Instalación del GPS"                     values={col((c) => c.pagoInicial.gpsContado)}       alt />
          <TotalLine values={col((c) => c.pagoInicial.total)} />
        </View>

        {/* ── Sección 3: Renta mensual (la única que varía) ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Renta mensual</Text>
          <TableLine label="Monto de la renta" values={col((c) => c.rentaMensual.montoNeto)} alt />
          <TableLine label="IVA"               values={col((c) => c.rentaMensual.iva)}        alt={false} />
          <TotalLine values={col((c) => c.rentaMensual.total)} />
        </View>

        {/* ── Sección 4: Valor de rescate / Opción de compra ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{seccion4Label}</Text>
          <TableLine label="Porcentaje" values={col((c) => c.residual.porcentaje)} alt isPercent />
          <TableLine label="Monto"      values={col((c) => c.residual.monto)}      alt={false} />
          <TableLine label="IVA"        values={col((c) => c.residual.iva)}        alt />
          <TotalLine values={col((c) => c.residual.total)} />
        </View>

        {/* ── Footer fijo: notas + contacto (idéntico al original) ── */}
        <View style={s.footer} fixed>
          <View style={s.notas}>
            {NOTAS.map((nota, i) => (
              <Text key={i} style={s.notaText}>{i + 1}.- {nota}</Text>
            ))}
          </View>
          <View style={s.contactoBox}>
            <Text style={s.contactoText}>{brand.contacto.direccion}</Text>
            <Text style={s.contactoText}>Teléfonos: {brand.contacto.telefonos}</Text>
            <Text style={s.contactoText}>E-mail: {brand.contacto.email}</Text>
            <Text style={s.contactoText}>Página web: {brand.contacto.web}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default ComparativaPDF;
