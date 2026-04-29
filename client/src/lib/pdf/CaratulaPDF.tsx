/**
 * CarátulaPDF — Anexo a) del Contrato (PURO/FIN).
 * ----------------------------------------------------------------
 * Resume todas las condiciones comerciales del contrato en un solo
 * documento de referencia rápida. Ambos contratos lo refieren en
 * múltiples cláusulas ("conforme a la Carátula del presente Contrato").
 *
 * Diseño: una página, dos columnas, con bloques: Identidad de las
 * partes · Datos del bien · Condiciones financieras · Calendario.
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors, fmtMoneySigned, fmtPct } from './tokens';
import { getBranding } from '@/lib/branding';
import {
  type ContractPdfProps,
  nombreClienteCompleto,
  nombreAvalCompleto,
  direccionUnaLinea,
  fmtFechaCorta,
} from './contractTypes';

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', lineHeight: 1.3 },
  headerRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.primary, paddingBottom: 6, marginBottom: 10 },
  logo: { width: 60, height: 40, objectFit: 'contain' },
  headerText: { flex: 1, marginLeft: 10 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.primary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 9, color: colors.textMuted, textAlign: 'center', marginBottom: 8 },
  twoCol: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  block: { borderWidth: 0.5, borderColor: colors.rowBorder, borderRadius: 3, padding: 8, marginBottom: 8 },
  blockTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: 90, color: colors.textMuted, fontSize: 8 },
  value: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  highlight: { backgroundColor: '#EFF5FA', padding: 6, marginBottom: 4, borderRadius: 2 },
});

export function CaratulaPDF(props: ContractPdfProps) {
  const { contract, client, avales, proveedor } = props;
  const b = getBranding();
  const nombreCli = nombreClienteCompleto(client);
  const dirCli = direccionUnaLinea(client) || '—';
  const productoLabel = contract.producto === 'PURO' ? 'Arrendamiento Puro' : 'Arrendamiento Financiero';

  return (
    <Document title={`Carátula ${contract.folio}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.headerRow}>
          <Image src="/brand/inyecta-logo.png" style={s.logo} />
          <View style={s.headerText}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary }}>
              {b.empresa.razonSocial}
            </Text>
            <Text style={{ fontSize: 7.5, color: colors.textMuted }}>
              CARÁTULA · {productoLabel} · Folio {contract.folio}
            </Text>
          </View>
        </View>

        <Text style={s.title}>CARÁTULA DEL CONTRATO</Text>
        <Text style={s.subtitle}>Documento anexo que forma parte integrante del Contrato</Text>

        {/* Identidad */}
        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.block}>
              <Text style={s.blockTitle}>LA ARRENDATARIA</Text>
              <View style={s.row}><Text style={s.label}>Nombre/Razón:</Text><Text style={s.value}>{nombreCli}</Text></View>
              <View style={s.row}><Text style={s.label}>RFC:</Text><Text style={s.value}>{client.rfc || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Tipo:</Text><Text style={s.value}>{client.tipo === 'PM' ? 'Persona Moral' : 'Persona Física'}</Text></View>
              <View style={s.row}><Text style={s.label}>Domicilio:</Text><Text style={s.value}>{dirCli}</Text></View>
              <View style={s.row}><Text style={s.label}>Email:</Text><Text style={s.value}>{client.email || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Teléfono:</Text><Text style={s.value}>{client.telefono || '—'}</Text></View>
            </View>
          </View>
          <View style={s.col}>
            <View style={s.block}>
              <Text style={s.blockTitle}>DEUDOR SOLIDARIO Y/O AVALISTA</Text>
              {avales.length === 0 ? (
                <Text style={{ fontSize: 8, color: colors.textMuted }}>Pendiente de captura</Text>
              ) : (
                avales.map((a) => (
                  <View key={a.orden} style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>
                      {nombreAvalCompleto(a)}{avales.length > 1 ? ` (Aval ${a.orden})` : ''}
                    </Text>
                    <Text style={{ fontSize: 8 }}>RFC: {a.rfc || '—'}</Text>
                    <Text style={{ fontSize: 8 }}>{direccionUnaLinea(a) || '—'}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        {/* Datos del bien */}
        <View style={s.block}>
          <Text style={s.blockTitle}>BIEN ARRENDADO</Text>
          <View style={s.twoCol}>
            <View style={s.col}>
              <View style={s.row}><Text style={s.label}>Descripción:</Text><Text style={s.value}>{contract.bienDescripcion}</Text></View>
              <View style={s.row}><Text style={s.label}>Marca:</Text><Text style={s.value}>{contract.bienMarca || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Modelo:</Text><Text style={s.value}>{contract.bienModelo || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Año:</Text><Text style={s.value}>{contract.bienAnio ?? '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Estado:</Text><Text style={s.value}>{contract.bienEstado || '—'}</Text></View>
            </View>
            <View style={s.col}>
              <View style={s.row}><Text style={s.label}>Color:</Text><Text style={s.value}>{contract.bienColor || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Placas:</Text><Text style={s.value}>{contract.bienPlacas || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>NIV/VIN:</Text><Text style={s.value}>{contract.bienNIV || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>No. Motor:</Text><Text style={s.value}>{contract.bienMotor || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>No. Serie:</Text><Text style={s.value}>{contract.bienNumSerie || '—'}</Text></View>
            </View>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Lugar entrega:</Text>
            <Text style={s.value}>{contract.lugarEntregaBien || dirCli}</Text>
          </View>
        </View>

        {/* Proveedor (sólo FIN) */}
        {contract.producto === 'FINANCIERO' && proveedor && (
          <View style={s.block}>
            <Text style={s.blockTitle}>PROVEEDOR DEL BIEN</Text>
            <View style={s.twoCol}>
              <View style={s.col}>
                <View style={s.row}><Text style={s.label}>Razón social:</Text><Text style={s.value}>{proveedor.nombre}</Text></View>
                <View style={s.row}><Text style={s.label}>RFC:</Text><Text style={s.value}>{proveedor.rfc || '—'}</Text></View>
                <View style={s.row}><Text style={s.label}>Contacto:</Text><Text style={s.value}>{proveedor.nombreContacto || '—'}</Text></View>
              </View>
              <View style={s.col}>
                <View style={s.row}><Text style={s.label}>Banco:</Text><Text style={s.value}>{proveedor.banco || '—'}</Text></View>
                <View style={s.row}><Text style={s.label}>CLABE:</Text><Text style={s.value}>{proveedor.clabe || '—'}</Text></View>
                <View style={s.row}><Text style={s.label}>Cuenta:</Text><Text style={s.value}>{proveedor.numCuenta || '—'}</Text></View>
              </View>
            </View>
          </View>
        )}

        {/* Condiciones financieras */}
        <View style={s.block}>
          <Text style={s.blockTitle}>CONDICIONES FINANCIERAS</Text>
          <View style={s.twoCol}>
            <View style={s.col}>
              <View style={s.row}><Text style={s.label}>Producto:</Text><Text style={s.value}>{productoLabel}</Text></View>
              <View style={s.row}><Text style={s.label}>Valor del bien:</Text><Text style={s.value}>{fmtMoneySigned(contract.valorBien)} (sin IVA)</Text></View>
              <View style={s.row}><Text style={s.label}>Plazo:</Text><Text style={s.value}>{contract.plazo} meses</Text></View>
              <View style={s.row}><Text style={s.label}>Tasa anual:</Text><Text style={s.value}>{fmtPct(contract.tasaAnual)}</Text></View>
              <View style={s.row}><Text style={s.label}>Tasa moratoria:</Text><Text style={s.value}>{fmtPct(contract.tasaMoratoria ?? contract.tasaAnual * 2)} (= 2× ord.)</Text></View>
              <View style={s.row}><Text style={s.label}>Enganche:</Text><Text style={s.value}>{fmtMoneySigned(contract.enganche)}</Text></View>
              <View style={s.row}><Text style={s.label}>Comisión apertura:</Text><Text style={s.value}>{fmtMoneySigned(contract.comisionApertura)}</Text></View>
            </View>
            <View style={s.col}>
              <View style={s.row}><Text style={s.label}>Depósito garantía:</Text><Text style={s.value}>{fmtMoneySigned(contract.depositoGarantia)}</Text></View>
              <View style={s.row}><Text style={s.label}>GPS:</Text><Text style={s.value}>{fmtMoneySigned(contract.gpsInstalacion)}</Text></View>
              <View style={s.row}><Text style={s.label}>Seguro anual:</Text><Text style={s.value}>{fmtMoneySigned(contract.seguroAnual)}</Text></View>
              <View style={s.row}>
                <Text style={s.label}>{contract.producto === 'PURO' ? 'Valor rescate:' : 'Valor residual:'}</Text>
                <Text style={s.value}>{fmtMoneySigned(contract.valorResidual)}</Text>
              </View>
              <View style={s.row}><Text style={s.label}>Monto a financiar:</Text><Text style={s.value}>{fmtMoneySigned(contract.montoFinanciar)}</Text></View>
            </View>
          </View>
          <View style={s.highlight}>
            <View style={s.row}><Text style={s.label}>Renta mensual:</Text><Text style={[s.value, { fontSize: 10 }]}>{fmtMoneySigned(contract.rentaMensual)} + IVA = {fmtMoneySigned(contract.rentaMensualIVA)}</Text></View>
          </View>
        </View>

        {/* Calendario */}
        <View style={s.block}>
          <Text style={s.blockTitle}>CALENDARIO</Text>
          <View style={s.twoCol}>
            <View style={s.col}>
              <View style={s.row}><Text style={s.label}>Fecha firma:</Text><Text style={s.value}>{fmtFechaCorta(contract.fechaFirma) || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>Entrega bien:</Text><Text style={s.value}>{fmtFechaCorta(contract.fechaEntregaBien) || '—'}</Text></View>
              <View style={s.row}><Text style={s.label}>1.ª renta:</Text><Text style={s.value}>{fmtFechaCorta(contract.fechaInicio) || '—'}</Text></View>
            </View>
            <View style={s.col}>
              <View style={s.row}><Text style={s.label}>Día de pago:</Text><Text style={s.value}>Cada día {contract.diaPagoMensual ?? (contract.fechaInicio ? new Date(contract.fechaInicio as Date).getDate() : '—')} del mes</Text></View>
              <View style={s.row}><Text style={s.label}>Vencimiento:</Text><Text style={s.value}>{fmtFechaCorta(contract.fechaVencimiento) || '—'}</Text></View>
            </View>
          </View>
        </View>

        {/* Datos bancarios */}
        <View style={s.block}>
          <Text style={s.blockTitle}>DATOS PARA EL PAGO DE RENTAS</Text>
          <View style={s.row}><Text style={s.label}>Beneficiario:</Text><Text style={s.value}>{b.banco.beneficiario || b.empresa.razonSocial}</Text></View>
          <View style={s.row}><Text style={s.label}>Banco:</Text><Text style={s.value}>{b.banco.nombre || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>CLABE:</Text><Text style={s.value}>{b.banco.clabe || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>Concepto:</Text><Text style={s.value}>Folio {contract.folio} — Renta mensual</Text></View>
        </View>
      </Page>
    </Document>
  );
}
