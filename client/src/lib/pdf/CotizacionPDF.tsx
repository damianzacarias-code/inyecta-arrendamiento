/**
 * PDF de Cotización — Inyecta Arrendamiento
 * ----------------------------------------------------------
 * Réplica fiel del formato Excel original de FSMP / Inyecta:
 *   • Fecha en esquina superior derecha
 *   • Logo "inyecta" centrado (versión con leyenda)
 *   • Razón social + "COTIZACIÓN ARRENDAMIENTO" centrado
 *   • Bloque de datos generales en 2 columnas (label / valor con underline)
 *   • 4 secciones con tabla zebra:
 *       Monto a financiar / Pago inicial / Renta mensual / Valor de rescate
 *     Cada una termina con fila TOTAL fondo azul cyan
 *   • 5 notas legales numeradas
 *   • Footer con dirección, teléfonos, email, web
 *
 * Carta vertical, una sola página (con header/footer fijos por si se desborda).
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors, fmtMoney, fmtMoneySigned } from './tokens';
import type { ResultadoCotizacion } from '../cotizacion/calculos';
import { getBranding } from '@/lib/branding';

// ────────────────────────────────────────────────────────────────────
// Constantes legales / contacto (mismos textos del Excel original)
// ────────────────────────────────────────────────────────────────────

const TITULO = 'COTIZACIÓN ARRENDAMIENTO';

/** Notas legales del Excel original. La razón social se interpola
 *  para que cambios al BRAND_RAZON_SOCIAL del backend se reflejen
 *  también en las cláusulas que la mencionan (1 y 4). */
function notasLegales(razonSocial: string): string[] {
  return [
    `Los seguros de los equipos arrendados podrán ser contratados con su aseguradora en forma multianual, con cobertura amplia contra el riesgo que este expuesto el bien objeto del arrendamiento, con endoso preferente e irrevocable a favor de ${razonSocial}.`,
    'La arrendataria deberá cubrir los gastos de mantenimiento, trámites y cualquier otro gasto relacionado con el bien objeto del arrendamiento.',
    'Los vencimientos de las rentas serán mensuales según fecha acordada.',
    `La presente cotización es de carácter informativo, por lo cual no presenta ningún compromiso para ${razonSocial} y estará sujeta a la autorización del comité de crédito.`,
    'El IVA del interés de las rentas mensuales se calcula de acuerdo a lo establecido en el Artículo 18-A de LIVA',
  ];
}

// ────────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 168,        // espacio reservado para footer fijo (notas + contacto)
    paddingHorizontal: 36,
    fontSize: 8.5,
    color: colors.text,
    fontFamily: 'Helvetica',
  },

  // ── Header ──────────────────────────────────────────────────
  fechaWrap:  { alignItems: 'flex-end', marginBottom: 2 },
  fechaText:  { fontSize: 9 },
  logoWrap:   { alignItems: 'center', marginVertical: 2 },
  logo:       { width: 150, height: 100, objectFit: 'contain' },
  brandLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  titleLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1, marginBottom: 6 },

  // ── Bloque datos generales ─────────────────────────────────
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    gap: 12,
  },
  dataCol: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-end',
    gap: 6,
  },
  dataLabel: {
    width: 86,
    fontSize: 8.5,
    color: colors.text,
  },
  dataValueBox: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    paddingBottom: 1,
    minHeight: 11,
  },
  dataValue: { fontSize: 8.5, color: colors.text },

  // ── Secciones (tabla) ──────────────────────────────────────
  section:      { marginTop: 6 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.4,
    borderBottomColor: '#9BB6C8',
  },
  rowBand:     { backgroundColor: colors.rowBand },
  rowWhite:    { backgroundColor: '#FFFFFF' },
  rowText:     { fontSize: 8.5, color: colors.text },
  rowAmount:   { fontSize: 8.5, color: colors.text, textAlign: 'right' },
  rowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.totalBg,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  rowTotalLabel:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },
  rowTotalAmount: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText, textAlign: 'right' },

  // ── Footer (notas + contacto) ──────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 36,
    right: 36,
  },
  notas: {
    marginBottom: 6,
  },
  notaText: {
    fontSize: 7,
    color: colors.text,
    marginBottom: 1.2,
    lineHeight: 1.22,
  },
  contactoBox: {
    borderTopWidth: 0.5,
    borderTopColor: '#000000',
    paddingTop: 3,
  },
  contactoText: {
    fontSize: 7,
    color: colors.text,
    lineHeight: 1.22,
  },
});

// ────────────────────────────────────────────────────────────────────
// Sub-componentes
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

function TableLine({
  label, amount, alt, isPercent,
}: {
  label: string; amount: number; alt: boolean; isPercent?: boolean;
}) {
  return (
    <View style={[s.tableRow, alt ? s.rowBand : s.rowWhite]}>
      <Text style={s.rowText}>{label}</Text>
      <Text style={s.rowAmount}>
        {isPercent ? (amount * 100).toFixed(2) + '%' : fmtMoneySigned(amount)}
      </Text>
    </View>
  );
}

function TotalLine({ amount }: { amount: number }) {
  return (
    <View style={s.rowTotal}>
      <Text style={s.rowTotalLabel}>TOTAL</Text>
      <Text style={s.rowTotalAmount}>${fmtMoney(amount)}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Documento principal
// ────────────────────────────────────────────────────────────────────

interface Props {
  /** Resultado del motor de cálculo (calcularCotizacion) */
  data: ResultadoCotizacion;
  /** Tasa anual mostrada como referencia (no se renderiza, se conserva por compat) */
  tasaAnual?: number;
  /** Logo (URL pública). Por defecto el lockup completo. */
  logoUrl?: string;
  /** Folio (no se renderiza, opcional) */
  folio?: string;
}

export function CotizacionPDF({
  data,
  logoUrl = '/brand/logo-inyecta.png',
}: Props) {
  const productoLabel = data.producto === 'PURO' ? 'Puro' : 'Financiero';
  const seccion4Label = data.producto === 'PURO' ? 'Valor de rescate' : 'Opción de compra';

  // Branding leído del singleton (cargado al boot por App.tsx).
  const branding = getBranding();
  const RAZON_SOCIAL = branding.empresa.razonSocial.toUpperCase();
  const NOTAS = notasLegales(branding.empresa.razonSocial.toUpperCase());
  const CONTACTO = {
    direccion: branding.contacto.direccion,
    telefonos: `Teléfonos: ${branding.contacto.telefonos}`,
    email:     `E-mail: ${branding.contacto.email}`,
    web:       `Página web: ${branding.contacto.web}`,
  };
  const docAuthor = `${branding.empresa.razonSocial} · ${branding.empresa.nombreComercial}`;

  return (
    <Document
      title={`Cotización ${data.nombreCliente}`}
      author={docAuthor}
      subject={`${TITULO} · ${productoLabel}`}
      creator={`${branding.empresa.nombreComercial} Arrendamiento`}
    >
      <Page size="LETTER" style={s.page}>
        {/* ── Fecha (esquina superior derecha) ─────────────── */}
        <View style={s.fechaWrap} fixed>
          <Text style={s.fechaText}>Fecha: {data.fecha}</Text>
        </View>

        {/* ── Logo + razón social + título ─────────────────── */}
        <View fixed>
          <View style={s.logoWrap}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
          </View>
          <Text style={s.brandLine}>{RAZON_SOCIAL}</Text>
          <Text style={s.titleLine}>{TITULO}</Text>
        </View>

        {/* ── Datos generales ──────────────────────────────── */}
        <DataLine
          leftLabel="Nombre del cliente"
          leftValue={data.nombreCliente || ''}
        />
        <DataLine
          leftLabel="Valor del bien"
          leftValue={fmtMoneySigned(data.valorBienConIVA)}
          rightLabel="Bien arrendado"
          rightValue={data.nombreBien || ''}
        />
        <DataLine
          leftLabel="Producto"
          leftValue={productoLabel}
          rightLabel="Estado del bien"
          rightValue={data.estadoBien || ''}
        />
        <DataLine
          leftLabel="Plazo"
          leftValue={`${data.plazo} meses`}
          rightLabel="Seguro"
          rightValue={data.seguroEstado || ''}
        />

        {/* ── Sección 1: Monto a financiar ─────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Monto a financiar</Text>
          <TableLine label="Valor del bien"                       amount={data.valorBienSinIVA}              alt />
          <TableLine label="Valor del bien con IVA (+)"            amount={data.monto.valorBienConIVA}        alt={false} />
          <TableLine label="Comisión por apertura financiada (+)"  amount={data.monto.comisionAperturaFinanciada} alt />
          <TableLine label="Seguro del bien (+)"                   amount={data.monto.seguroFinanciado}       alt={false} />
          <TableLine label="Instalación del GPS financiada (+)"    amount={data.monto.gpsFinanciado}          alt />
          <TotalLine amount={data.monto.total} />
        </View>

        {/* ── Sección 2: Pago inicial ──────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Pago inicial</Text>
          <TableLine label="Pago anticipado"                amount={data.pagoInicial.engancheContado}         alt />
          <TableLine label="Comisión por apertura contado"  amount={data.pagoInicial.comisionAperturaContado} alt={false} />
          <TableLine label="Apertura de seguro"             amount={data.pagoInicial.aperturaSeguros}         alt />
          <TableLine label="Depósito en garantía"           amount={data.pagoInicial.depositoGarantia}        alt={false} />
          <TableLine label="Instalación del GPS"            amount={data.pagoInicial.gpsContado}              alt />
          <TotalLine amount={data.pagoInicial.total} />
        </View>

        {/* ── Sección 3: Renta mensual ─────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Renta mensual</Text>
          <TableLine label="Monto de la renta" amount={data.rentaMensual.montoNeto} alt />
          <TableLine label="IVA"               amount={data.rentaMensual.iva}        alt={false} />
          <TotalLine amount={data.rentaMensual.total} />
        </View>

        {/* ── Sección 4: Valor de rescate / Opción de compra ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{seccion4Label}</Text>
          <TableLine label="Porcentaje" amount={data.residual.porcentaje} alt isPercent />
          <TableLine label="Monto"      amount={data.residual.monto}      alt={false} />
          <TableLine label="IVA"        amount={data.residual.iva}        alt />
          <TotalLine amount={data.residual.total} />
        </View>

        {/* ── Footer fijo: notas + contacto ────────────────── */}
        <View style={s.footer} fixed>
          <View style={s.notas}>
            {NOTAS.map((nota, i) => (
              <Text key={i} style={s.notaText}>
                {i + 1}.- {nota}
              </Text>
            ))}
          </View>
          <View style={s.contactoBox}>
            <Text style={s.contactoText}>{CONTACTO.direccion}</Text>
            <Text style={s.contactoText}>{CONTACTO.telefonos}</Text>
            <Text style={s.contactoText}>{CONTACTO.email}</Text>
            <Text style={s.contactoText}>{CONTACTO.web}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default CotizacionPDF;
