/**
 * ActaEntregaPDF — Acta de Entrega-Recepción del Bien Arrendado.
 * ----------------------------------------------------------------
 * Anexo b) (PURO) y c) (FIN). Cláusula TERCERA de ambos contratos
 * exige que la entrega se formalice "contra firma del Acta de
 * Entrega-Recepción", recibiendo el bien "AD-CORPUS" y a satisfacción.
 *
 * Una página, formato carta, con espacios para condiciones físicas
 * iniciales y firmas.
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors } from './tokens';
import { getBranding } from '@/lib/branding';
import {
  type ContractPdfProps,
  nombreClienteCompleto,
  direccionUnaLinea,
  fmtFechaLarga,
} from './contractTypes';

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: 'Helvetica', lineHeight: 1.4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.primary, paddingBottom: 6, marginBottom: 14 },
  logo: { width: 60, height: 40, objectFit: 'contain' },
  headerText: { flex: 1, marginLeft: 10 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.primary, textAlign: 'center', marginBottom: 14 },
  subtitle: { fontSize: 9, color: colors.textMuted, textAlign: 'center', marginBottom: 14 },
  para: { marginTop: 6, textAlign: 'justify' },
  highlight: { fontFamily: 'Helvetica-Bold' },
  block: { borderWidth: 0.5, borderColor: colors.rowBorder, borderRadius: 3, padding: 8, marginTop: 8 },
  blockTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary, marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: 100, color: colors.textMuted, fontSize: 8 },
  value: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  observBox: { marginTop: 4, height: 60, borderWidth: 0.3, borderColor: colors.rowBorder, padding: 4 },
  signWrap: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-around' },
  signCol: { width: 220, alignItems: 'center' },
  signLine: { borderTopWidth: 0.5, borderTopColor: colors.text, width: '100%', marginBottom: 3 },
  signName: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  signRole: { fontSize: 8, color: colors.textMuted, textAlign: 'center' },
});

export function ActaEntregaPDF(props: ContractPdfProps) {
  const { contract, client } = props;
  const b = getBranding();
  const nombreCli = nombreClienteCompleto(client);
  const lugarEntrega =
    contract.lugarEntregaBien || direccionUnaLinea(client) || '__________';
  const fechaEntrega = fmtFechaLarga(contract.fechaEntregaBien);
  const productoLabel = contract.producto === 'PURO' ? 'Arrendamiento Puro' : 'Arrendamiento Financiero';

  return (
    <Document title={`Acta Entrega ${contract.folio}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.headerRow}>
          <Image src="/brand/inyecta-logo.png" style={s.logo} />
          <View style={s.headerText}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary }}>
              {b.empresa.razonSocial}
            </Text>
            <Text style={{ fontSize: 7.5, color: colors.textMuted }}>
              {productoLabel} · Folio {contract.folio}
            </Text>
          </View>
        </View>

        <Text style={s.title}>ACTA DE ENTREGA-RECEPCIÓN</Text>
        <Text style={s.subtitle}>Anexo del Contrato de {productoLabel}</Text>

        <Text style={s.para}>
          En el lugar referido como{' '}
          <Text style={s.highlight}>{lugarEntrega}</Text>, siendo el día{' '}
          <Text style={s.highlight}>{fechaEntrega}</Text>, comparecen, por una parte,{' '}
          <Text style={s.highlight}>{b.empresa.razonSocial}</Text>, en lo sucesivo "LA
          ARRENDADORA", y por la otra, <Text style={s.highlight}>{nombreCli}</Text>, en lo
          sucesivo "LA ARRENDATARIA", al amparo del Contrato de {productoLabel} folio{' '}
          <Text style={s.highlight}>{contract.folio}</Text> celebrado entre las partes,
          a efecto de hacer constar la entrega física del Bien Arrendado.
        </Text>

        <View style={s.block}>
          <Text style={s.blockTitle}>BIEN ARRENDADO</Text>
          <View style={s.row}><Text style={s.label}>Descripción:</Text><Text style={s.value}>{contract.bienDescripcion}</Text></View>
          <View style={s.row}><Text style={s.label}>Marca / Modelo:</Text><Text style={s.value}>{[contract.bienMarca, contract.bienModelo].filter(Boolean).join(' / ') || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>Año:</Text><Text style={s.value}>{contract.bienAnio ?? '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>Color:</Text><Text style={s.value}>{contract.bienColor || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>Placas:</Text><Text style={s.value}>{contract.bienPlacas || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>NIV/VIN:</Text><Text style={s.value}>{contract.bienNIV || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>No. Motor:</Text><Text style={s.value}>{contract.bienMotor || '—'}</Text></View>
          <View style={s.row}><Text style={s.label}>No. Serie:</Text><Text style={s.value}>{contract.bienNumSerie || '—'}</Text></View>
        </View>

        <Text style={s.para}>
          LA ARRENDATARIA reconoce expresamente que ha inspeccionado el Bien Arrendado
          previo a la firma de la presente acta, y declara recibirlo "
          <Text style={s.highlight}>AD-CORPUS</Text>" y a su entera satisfacción, en el
          estado físico y mecánico en que se encuentra, con sus dimensiones y
          características actuales. A partir de la firma de esta acta, LA ARRENDATARIA
          asume todos los riesgos inherentes al uso, custodia y conservación del Bien,
          liberando a LA ARRENDADORA de cualquier responsabilidad al respecto, conforme a
          las cláusulas del Contrato.
        </Text>

        <View style={s.block}>
          <Text style={s.blockTitle}>OBSERVACIONES Y CONDICIONES INICIALES</Text>
          <Text style={{ fontSize: 8, color: colors.textMuted }}>
            (Daños visibles, accesorios entregados, kilometraje/horómetro inicial, etc.)
          </Text>
          <View style={s.observBox} />
        </View>

        <Text style={s.para}>
          Se entregaron, asimismo, los siguientes documentos / accesorios:
          □ Llaves   □ Tarjeta de circulación   □ Factura del proveedor
          □ Manual del usuario   □ Otros: __________________________________
        </Text>

        <View style={s.signWrap}>
          <View style={s.signCol}>
            <View style={s.signLine} />
            <Text style={s.signName}>{b.empresa.razonSocial}</Text>
            <Text style={s.signRole}>LA ARRENDADORA — Entrega</Text>
          </View>
          <View style={s.signCol}>
            <View style={s.signLine} />
            <Text style={s.signName}>{nombreCli}</Text>
            <Text style={s.signRole}>LA ARRENDATARIA — Recibe a satisfacción</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
