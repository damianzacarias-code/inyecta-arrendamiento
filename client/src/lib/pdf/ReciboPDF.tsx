/**
 * PDF Recibo de Pago — Cobranza (CLAUDE.md §10 D2 jspdf cleanup)
 * ----------------------------------------------------------------
 * Recibo informativo (no fiscal) que se entrega al cliente cuando
 * cobranza registra un pago en caja receptora. Comparte identidad
 * visual con CotizacionPDF / AmortizacionPDF / EstadoCuentaPDF
 * (mismo header con logo + razón social + footer de contacto).
 *
 *   Sección 1: Importe destacado en verde + tipo + fecha
 *   Sección 2: Datos del cliente y del contrato
 *   Sección 3: Desglose de conceptos (renta, IVA, mora, etc.)
 *   Sección 4: Importe en letras + notas/referencia
 *   Sección 5: Sello de "Recibió" + firma del cliente
 *
 * Reemplaza al legacy client/src/lib/reciboPDF.ts (jspdf), eliminado
 * en la misma sesión para que jspdf y jspdf-autotable salgan de
 * package.json.
 */
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import { colors, fmtMoneySigned } from './tokens';

const RAZON_SOCIAL = 'FSMP SOLUCIONES DE CAPITAL, S.A. DE C.V., SOFOM, E.N.R.';
const TITULO       = 'RECIBO DE PAGO';

const CONTACTO = {
  direccion: 'Av. Sierra Vista 1305, Piso 4 Oficina 7, Col. Lomas del Tecnológico, C.P. 78215, San Luis Potosí, S.L.P.',
  telefonos: 'Teléfonos: 444-521-7204 / 444-521-6980',
  email:     'E-mail: contacto@inyecta.com.mx',
  web:       'Página web: www.inyecta.com.mx',
};

// Etiquetas humanas para el enum de Payment.tipo del backend.
const TIPO_LABELS: Record<string, string> = {
  RENTA_ORDINARIA:        'Renta ordinaria',
  RENTA_ADELANTADA:       'Renta adelantada',
  ABONO_CAPITAL:          'Abono a capital',
  LIQUIDACION_ANTICIPADA: 'Liquidación anticipada',
  MORATORIO:              'Cargo moratorio',
  RENTA_EXTRAORDINARIA:   'Renta extraordinaria',
  ENGANCHE:               'Enganche',
  DEPOSITO_GARANTIA:      'Depósito en garantía',
  COMISION_APERTURA:      'Comisión por apertura',
  SEGURO:                 'Seguro',
  GPS:                    'GPS',
  OTRO:                   'Otro',
};

// ────────────────────────────────────────────────────────────────────
// Tipos (matchean GET /api/cobranza/payment/:id/recibo)
// ────────────────────────────────────────────────────────────────────

export interface ReciboPago {
  id: string;
  tipo: string;
  periodo: number | null;
  fechaPago: string | Date;
  fechaVencimiento: string | Date | null;
  montoRenta: number;
  montoIVA: number;
  montoSeguro: number;
  montoMoratorio: number;
  montoIVAMoratorio: number;
  montoCapitalExtra: number;
  montoTotal: number;
  diasAtraso: number;
  referencia: string | null;
  observaciones: string | null;
  createdAt: string | Date;
}

export interface ReciboContratoCliente {
  tipo: string;
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
  rfc?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export interface ReciboContrato {
  folio: string;
  producto: 'PURO' | 'FINANCIERO';
  plazo: number;
  client: ReciboContratoCliente | null;
}

export interface ReciboData {
  folio: string;                  // REC-YYYY-NNNN
  pago:    ReciboPago;
  contrato: ReciboContrato;
  usuario: string | null;         // quién recibió el pago
}

// ────────────────────────────────────────────────────────────────────
// Helpers
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

function getClienteNombre(c: ReciboContratoCliente | null): string {
  if (!c) return 'Cliente';
  if ((c.tipo === 'PM' || c.tipo === 'PERSONA_MORAL') && c.razonSocial) return c.razonSocial;
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ')
      || c.razonSocial
      || 'Cliente';
}

// ─── Convertir monto a letras (versión simple, MXN) ───────────────
// Mismo algoritmo que el legacy reciboPDF.ts para mantener output idéntico.
function montoEnLetras(monto: number): string {
  const partes = monto.toFixed(2).split('.');
  const entero = Number(partes[0]);
  const cents  = partes[1];
  return `${numeroALetras(entero)} pesos ${cents}/100 M.N.`;
}

function numeroALetras(n: number): string {
  if (n === 0) return 'cero';
  if (n < 0) return `menos ${numeroALetras(-n)}`;
  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const especiales: Record<number, string> = {
    10: 'diez', 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
    16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve', 20: 'veinte',
    30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta',
    80: 'ochenta', 90: 'noventa', 100: 'cien', 500: 'quinientos', 700: 'setecientos', 900: 'novecientos',
  };
  const decenas = (x: number): string => {
    if (especiales[x]) return especiales[x];
    if (x < 30) return 'venti' + unidades[x - 20];
    const d = Math.floor(x / 10) * 10, u = x % 10;
    return especiales[d] + (u ? ' y ' + unidades[u] : '');
  };
  const centenas = (x: number): string => {
    if (especiales[x]) return especiales[x];
    if (x < 100) return decenas(x);
    const c = Math.floor(x / 100), r = x % 100;
    const cs = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    return cs[c] + (r ? ' ' + decenas(r) : '');
  };
  if (n < 1000) return centenas(n);
  if (n < 1000000) {
    const m = Math.floor(n / 1000), r = n % 1000;
    const pre = m === 1 ? 'mil' : centenas(m) + ' mil';
    return pre + (r ? ' ' + centenas(r) : '');
  }
  const mill = Math.floor(n / 1000000), r = n % 1000000;
  const pre = mill === 1 ? 'un millón' : numeroALetras(mill) + ' millones';
  return pre + (r ? ' ' + numeroALetras(r) : '');
}

// ────────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 64,
    paddingHorizontal: 32,
    fontSize: 9,
    color: colors.text,
    fontFamily: 'Helvetica',
  },

  // Header (no `fixed` — el recibo casi siempre cabe en una página)
  fechaWrap:  { alignItems: 'flex-end', marginBottom: 2 },
  fechaText:  { fontSize: 9 },
  logoWrap:   { alignItems: 'center', marginBottom: 4 },
  logo:       { width: 110, height: 70, objectFit: 'contain' },
  brandLine:  { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  titleWrap:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  titleLine:  { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  folioLine:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.primary },

  // Sección "Importe recibido" destacada
  importeBox: {
    marginTop: 10,
    backgroundColor: colors.bgHighlight,
    borderWidth: 0.5,
    borderColor: colors.rowBorder,
    borderRadius: 4,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  importeLabel: { fontSize: 8.5, color: colors.textMuted, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  importeMonto: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: colors.positive, marginTop: 2 },
  importeMeta:  { alignItems: 'flex-end' },
  importeMetaL: { fontSize: 9 },

  // Bloques de sección
  section: { marginTop: 10 },
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

  row2:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  cellL:  { width: '48%' },
  cellR:  { width: '48%' },
  label:  { fontSize: 8, color: colors.textMuted, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  value:  { fontSize: 9.5, marginTop: 1 },

  // Tabla desglose
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.headerBg,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th:       { color: colors.headerText, fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  thRight:  { textAlign: 'right' },

  trow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.25,
    borderColor: colors.rowBorder,
  },
  trowAlt:  { backgroundColor: colors.rowBand },
  td:       { fontSize: 9 },
  tdRight:  { textAlign: 'right' },

  colConcept: { width: '70%' },
  colMonto:   { width: '30%' },

  totalRow: {
    flexDirection: 'row',
    backgroundColor: colors.totalBg,
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginTop: -0.25,                // colapsa el borde con la última fila
  },
  totalText: { color: colors.totalText, fontFamily: 'Helvetica-Bold', fontSize: 10 },

  // Importe en letras
  letrasBox: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: colors.rowBorder,
    backgroundColor: colors.bgSoft,
  },
  letrasText: { fontSize: 9, fontStyle: 'italic' },

  // Notas
  notasTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary, marginTop: 8 },
  notaItem:   { fontSize: 9, marginTop: 2 },

  // Avisos (mora)
  avisoMora: {
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: colors.warning,
    backgroundColor: '#FFF8DC',
    borderRadius: 2,
  },
  avisoMoraText: { fontSize: 8.5, color: colors.text },

  // Sello / firmas
  selloRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  selloBox:    { width: '45%', alignItems: 'center' },
  selloLine:   { borderTopWidth: 0.5, borderColor: colors.rowBorder, width: '100%', marginBottom: 2 },
  selloLabel:  { fontSize: 8, color: colors.textMuted },
  selloValue:  { fontSize: 9 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    fontSize: 7.5,
    color: colors.textMuted,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderColor: colors.rowBorder,
    paddingTop: 4,
  },
  footerNote: { fontSize: 7.5, color: colors.textMuted, marginTop: 2 },
});

// ────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────

export function ReciboPDF({ folio, pago, contrato, usuario }: ReciboData) {
  const cliente = getClienteNombre(contrato.client);
  const c       = contrato.client;
  const fechaEmision = fmtFechaLarga(new Date());

  // Construir desglose: solo conceptos > 0 (igual que el legacy).
  const desglose: Array<{ label: string; monto: number }> = [];
  if (pago.montoRenta > 0)        desglose.push({ label: 'Renta',                                            monto: pago.montoRenta });
  if (pago.montoIVA > 0)          desglose.push({ label: 'IVA renta (16%)',                                  monto: pago.montoIVA });
  if (pago.montoSeguro > 0)       desglose.push({ label: 'Seguro',                                           monto: pago.montoSeguro });
  if (pago.montoMoratorio > 0)    desglose.push({ label: `Moratorios (${pago.diasAtraso} días)`,             monto: pago.montoMoratorio });
  if (pago.montoIVAMoratorio > 0) desglose.push({ label: 'IVA moratorios',                                   monto: pago.montoIVAMoratorio });
  if (pago.montoCapitalExtra > 0) desglose.push({ label: 'Abono a capital',                                  monto: pago.montoCapitalExtra });
  // Fallback: si todos los desglosados son 0, mostrar el total para no dejar tabla vacía.
  if (desglose.length === 0)      desglose.push({ label: TIPO_LABELS[pago.tipo] || pago.tipo,                monto: pago.montoTotal });

  const tipoLabel = TIPO_LABELS[pago.tipo] || pago.tipo;

  return (
    <Document
      title={`Recibo ${folio}`}
      author="Inyecta SOFOM"
      subject="Recibo de pago — Cobranza"
    >
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View>
          <View style={s.fechaWrap}>
            <Text style={s.fechaText}>Fecha de emisión: {fechaEmision}</Text>
          </View>
          <View style={s.logoWrap}>
            <Image src="/brand/logo-inyecta.png" style={s.logo} />
          </View>
          <Text style={s.brandLine}>{RAZON_SOCIAL}</Text>
          <View style={s.titleWrap}>
            <Text style={s.titleLine}>{TITULO}</Text>
            <Text style={s.folioLine}>{folio}</Text>
          </View>
        </View>

        {/* Importe destacado */}
        <View style={s.importeBox}>
          <View>
            <Text style={s.importeLabel}>Importe recibido</Text>
            <Text style={s.importeMonto}>{fmtMoneySigned(pago.montoTotal)}</Text>
          </View>
          <View style={s.importeMeta}>
            <Text style={s.importeMetaL}>Fecha: {fmtFecha(pago.fechaPago)}</Text>
            <Text style={s.importeMetaL}>Tipo: {tipoLabel}</Text>
            {pago.periodo != null && (
              <Text style={s.importeMetaL}>Renta #{pago.periodo}</Text>
            )}
          </View>
        </View>

        {/* Sección 1 — Cliente / contrato */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>1. Datos del cliente y contrato</Text>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Cliente</Text>
                <Text style={s.value}>{cliente}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Folio del contrato</Text>
                <Text style={s.value}>{contrato.folio}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>RFC</Text>
                <Text style={s.value}>{c?.rfc ?? '—'}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Producto</Text>
                <Text style={s.value}>
                  Arrendamiento {contrato.producto === 'PURO' ? 'Puro' : 'Financiero'}
                </Text>
              </View>
            </View>
            <View style={s.row2}>
              <View style={s.cellL}>
                <Text style={s.label}>Teléfono</Text>
                <Text style={s.value}>{c?.telefono ?? '—'}</Text>
              </View>
              <View style={s.cellR}>
                <Text style={s.label}>Plazo</Text>
                <Text style={s.value}>{contrato.plazo} meses</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sección 2 — Desglose */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>2. Desglose del pago</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, s.colConcept]}>Concepto</Text>
            <Text style={[s.th, s.thRight, s.colMonto]}>Importe</Text>
          </View>
          {desglose.map((d, i) => (
            <View key={`${d.label}-${i}`} style={[s.trow, i % 2 === 1 ? s.trowAlt : {}]} wrap={false}>
              <Text style={[s.td, s.colConcept]}>{d.label}</Text>
              <Text style={[s.td, s.tdRight, s.colMonto]}>{fmtMoneySigned(d.monto)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.totalText, s.colConcept]}>TOTAL RECIBIDO</Text>
            <Text style={[s.totalText, s.tdRight, s.colMonto]}>{fmtMoneySigned(pago.montoTotal)}</Text>
          </View>
        </View>

        {/* Importe en letras */}
        <View style={s.letrasBox}>
          <Text style={s.letrasText}>Son: ({montoEnLetras(pago.montoTotal)})</Text>
        </View>

        {/* Notas / referencia */}
        {(pago.referencia || pago.observaciones) && (
          <View>
            <Text style={s.notasTitle}>Notas:</Text>
            {pago.referencia && (
              <Text style={s.notaItem}>Referencia bancaria: {pago.referencia}</Text>
            )}
            {pago.observaciones && (
              <Text style={s.notaItem}>Observaciones: {pago.observaciones}</Text>
            )}
          </View>
        )}

        {/* Aviso de mora */}
        {pago.diasAtraso > 0 && (
          <View style={s.avisoMora}>
            <Text style={s.avisoMoraText}>
              Pago con {pago.diasAtraso} días de atraso. Tasa moratoria 0.2% diario sobre saldo vencido.
            </Text>
          </View>
        )}

        {/* Sello / firmas */}
        <View style={s.selloRow}>
          <View style={s.selloBox}>
            <View style={s.selloLine} />
            <Text style={s.selloLabel}>Recibió</Text>
            <Text style={s.selloValue}>{usuario || '—'}</Text>
          </View>
          <View style={s.selloBox}>
            <View style={s.selloLine} />
            <Text style={s.selloLabel}>Firma del cliente</Text>
            <Text style={s.selloValue}>{cliente}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>{CONTACTO.direccion}</Text>
          <Text>{CONTACTO.telefonos} · {CONTACTO.email} · {CONTACTO.web}</Text>
          <Text style={s.footerNote}>Documento informativo, no fiscal · Recibo {folio}</Text>
        </View>
      </Page>
    </Document>
  );
}
