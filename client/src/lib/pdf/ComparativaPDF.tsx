/**
 * PDF de Cotización COMPARATIVA — Inyecta Arrendamiento
 * ----------------------------------------------------------
 * Mismo bien / producto / tasa, comparando 3 plazos lado a lado (las
 * columnas las elige el operador, default 24/36/48). Formato "Resumen":
 * encabezado compartido + tabla con las filas clave por columna.
 *
 * Reusa el header/footer y los tokens del CotizacionPDF para mantener la
 * identidad de marca. Los montos vienen del MISMO motor verificado al
 * centavo (calcularCotizacion), así que la columna de N meses coincide
 * exactamente con la cotización individual a N meses.
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors, fmtMoney } from './tokens';
import type { ResultadoCotizacion } from '../cotizacion/calculos';
import { getBranding } from '@/lib/branding';

const TITULO = 'COTIZACIÓN ARRENDAMIENTO — COMPARATIVA DE PLAZOS';

function notasLegales(razonSocial: string): string[] {
  return [
    `Los seguros de los equipos arrendados podrán ser contratados con su aseguradora en forma multianual, con cobertura amplia contra el riesgo que este expuesto el bien objeto del arrendamiento, con endoso preferente e irrevocable a favor de ${razonSocial}.`,
    'La arrendataria deberá cubrir los gastos de mantenimiento, trámites y cualquier otro gasto relacionado con el bien objeto del arrendamiento.',
    'Los vencimientos de las rentas serán mensuales según fecha acordada.',
    `La presente cotización es de carácter informativo, por lo cual no presenta ningún compromiso para ${razonSocial} y estará sujeta a la autorización del comité de crédito.`,
    'El IVA del interés de las rentas mensuales se calcula de acuerdo a lo establecido en el Artículo 18-A de LIVA',
  ];
}

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 168,
    paddingHorizontal: 36,
    fontSize: 8.5,
    color: colors.text,
    fontFamily: 'Helvetica',
  },
  fechaWrap: { alignItems: 'flex-end', marginBottom: 2 },
  fechaText: { fontSize: 9 },
  logoWrap: { alignItems: 'center', marginVertical: 2 },
  logo: { width: 150, height: 100, objectFit: 'contain' },
  brandLine: { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  titleLine: { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1, marginBottom: 6 },

  // Datos generales (compartidos)
  dataRow: { flexDirection: 'row', paddingVertical: 3, gap: 12 },
  dataCol: { flexDirection: 'row', flex: 1, alignItems: 'flex-end', gap: 6 },
  dataLabel: { width: 86, fontSize: 8.5, color: colors.text },
  dataValueBox: { flex: 1, borderBottomWidth: 0.5, borderBottomColor: '#000000', paddingBottom: 1, minHeight: 11 },
  dataValue: { fontSize: 8.5, color: colors.text },

  // Tabla comparativa
  tabla: { marginTop: 10, borderWidth: 0.5, borderColor: '#9BB6C8' },
  headRow: { flexDirection: 'row', backgroundColor: colors.totalBg },
  headConcepto: { flex: 2.2, paddingVertical: 4, paddingHorizontal: 6 },
  headConceptoText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },
  headPlazo: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center', borderLeftWidth: 0.5, borderLeftColor: '#FFFFFF' },
  headPlazoText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },

  row: { flexDirection: 'row', borderTopWidth: 0.4, borderTopColor: '#9BB6C8' },
  rowBand: { backgroundColor: colors.rowBand },
  rowWhite: { backgroundColor: '#FFFFFF' },
  rowHighlight: { backgroundColor: '#E3EEF5' },
  concepto: { flex: 2.2, paddingVertical: 3.5, paddingHorizontal: 6 },
  conceptoText: { fontSize: 8.5, color: colors.text },
  conceptoBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.text },
  celda: { flex: 1, paddingVertical: 3.5, paddingHorizontal: 6, alignItems: 'flex-end', borderLeftWidth: 0.4, borderLeftColor: '#D6E2EA' },
  celdaText: { fontSize: 8.5, color: colors.text },
  celdaBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.text },

  totalRow: { flexDirection: 'row', backgroundColor: colors.totalBg },
  totalConcepto: { flex: 2.2, paddingVertical: 4, paddingHorizontal: 6 },
  totalConceptoText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },
  totalCelda: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, alignItems: 'flex-end', borderLeftWidth: 0.5, borderLeftColor: '#FFFFFF' },
  totalCeldaText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.totalText },

  nota: { fontSize: 7.5, color: '#555', marginTop: 6, fontFamily: 'Helvetica-Oblique' },

  footer: { position: 'absolute', bottom: 16, left: 36, right: 36 },
  notas: { marginBottom: 6 },
  notaText: { fontSize: 7, color: colors.text, marginBottom: 1.2, lineHeight: 1.22 },
  contactoBox: { borderTopWidth: 0.5, borderTopColor: '#000000', paddingTop: 3 },
  contactoText: { fontSize: 7, color: colors.text, lineHeight: 1.22 },
});

interface ColumnaCot {
  plazo: number;
  cot: ResultadoCotizacion;
}

interface Props {
  /** 3 cotizaciones del mismo bien a distintos plazos (orden = columnas). */
  cotizaciones: ColumnaCot[];
  /** Tasa anual (referencia en el encabezado). */
  tasaAnual: number;
  /** Enganche % (referencia en el encabezado). */
  enganchePct: number;
  logoUrl?: string;
}

/** Fila de la tabla: concepto + un valor por columna. */
function FilaComparativa({
  label, valores, alt, bold, highlight,
}: {
  label: string;
  valores: number[];
  alt: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  const rowStyle = highlight ? s.rowHighlight : alt ? s.rowBand : s.rowWhite;
  return (
    <View style={[s.row, rowStyle]}>
      <View style={s.concepto}>
        <Text style={bold ? s.conceptoBold : s.conceptoText}>{label}</Text>
      </View>
      {valores.map((v, i) => (
        <View key={i} style={s.celda}>
          <Text style={bold ? s.celdaBold : s.celdaText}>${fmtMoney(v)}</Text>
        </View>
      ))}
    </View>
  );
}

export function ComparativaPDF({
  cotizaciones,
  tasaAnual,
  enganchePct,
  logoUrl = '/brand/logo-inyecta.png',
}: Props) {
  const brand = getBranding();
  const razonSocial = brand.empresa.razonSocial.toUpperCase(); // espejo de CotizacionPDF
  const base = cotizaciones[0]?.cot;
  const productoLabel = base?.producto === 'PURO' ? 'Puro' : 'Financiero';
  const seccion4Label = base?.producto === 'PURO' ? 'Valor de rescate (con IVA)' : 'Opción de compra (con IVA)';
  const notas = notasLegales(razonSocial);

  return (
    <Document title={`Comparativa ${base?.nombreCliente ?? ''}`}>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.fechaWrap}>
          <Text style={s.fechaText}>Fecha: {base?.fecha}</Text>
        </View>
        <View style={s.logoWrap}>
          <Image style={s.logo} src={logoUrl} />
        </View>
        <Text style={s.brandLine}>{razonSocial}</Text>
        <Text style={s.titleLine}>{TITULO}</Text>

        {/* Datos generales compartidos */}
        <View style={s.dataRow}>
          <View style={s.dataCol}>
            <Text style={s.dataLabel}>Nombre del cliente</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>{base?.nombreCliente || ''}</Text></View>
          </View>
          <View style={s.dataCol}>
            <Text style={s.dataLabel}>Bien arrendado</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>{base?.nombreBien || ''}</Text></View>
          </View>
        </View>
        <View style={s.dataRow}>
          <View style={s.dataCol}>
            <Text style={s.dataLabel}>Valor del bien</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>${fmtMoney(base?.valorBienConIVA ?? 0)} (con IVA)</Text></View>
          </View>
          <View style={s.dataCol}>
            <Text style={s.dataLabel}>Producto</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>{productoLabel}</Text></View>
          </View>
        </View>
        <View style={s.dataRow}>
          <View style={s.dataCol}>
            <Text style={s.dataLabel}>Tasa anual</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>{(tasaAnual * 100).toFixed(0)}%</Text></View>
          </View>
          <View style={s.dataCol}>
            <Text style={s.dataLabel}>Enganche</Text>
            <View style={s.dataValueBox}><Text style={s.dataValue}>{(enganchePct * 100).toFixed(0)}%</Text></View>
          </View>
        </View>

        {/* Tabla comparativa */}
        <View style={s.tabla}>
          <View style={s.headRow}>
            <View style={s.headConcepto}><Text style={s.headConceptoText}>Concepto</Text></View>
            {cotizaciones.map((c, i) => (
              <View key={i} style={s.headPlazo}>
                <Text style={s.headPlazoText}>{c.plazo} meses</Text>
              </View>
            ))}
          </View>

          <FilaComparativa
            label="Renta mensual (con IVA)"
            valores={cotizaciones.map((c) => c.cot.rentaMensual.total)}
            alt={false}
            bold
            highlight
          />
          <FilaComparativa
            label="Pago inicial (con IVA)"
            valores={cotizaciones.map((c) => c.cot.pagoInicial.total)}
            alt
          />
          <FilaComparativa
            label="Total de rentas"
            valores={cotizaciones.map((c) => c.cot.totalRentas)}
            alt={false}
          />
          <FilaComparativa
            label={seccion4Label}
            valores={cotizaciones.map((c) => c.cot.residual.total)}
            alt
          />

          <View style={s.totalRow}>
            <View style={s.totalConcepto}><Text style={s.totalConceptoText}>Total a pagar</Text></View>
            {cotizaciones.map((c, i) => (
              <View key={i} style={s.totalCelda}>
                <Text style={s.totalCeldaText}>${fmtMoney(c.cot.totalPagar)}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={s.nota}>
          A mayor plazo, la renta mensual baja pero el total a pagar sube
          (se pagan más meses de interés). El pago inicial no cambia con el plazo.
        </Text>

        {/* Footer fijo */}
        <View style={s.footer} fixed>
          <View style={s.notas}>
            {notas.map((n, i) => (
              <Text key={i} style={s.notaText}>{i + 1}.- {n}</Text>
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
