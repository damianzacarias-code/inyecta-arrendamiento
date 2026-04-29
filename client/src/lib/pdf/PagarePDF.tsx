/**
 * PagarePDF — Título de crédito de garantía (cláusula DÉCIMA TERCERA del FIN).
 * ----------------------------------------------------------------------------
 * Pagaré a la orden de LA ARRENDADORA por el importe total del precio
 * pactado por concepto de renta global (renta × plazo × IVA). Lo
 * suscriben LA ARRENDATARIA y EL DEUDOR SOLIDARIO Y/O AVALISTA.
 *
 * Formato carta vertical, una sola página, márgenes generosos para
 * permitir la firma manuscrita.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { colors, fmtMoneySigned } from './tokens';
import { getBranding } from '@/lib/branding';
import {
  type ContractPdfProps,
  nombreClienteCompleto,
  nombreAvalCompleto,
  fmtFechaLarga,
  numeroALetraSimple,
} from './contractTypes';

const s = StyleSheet.create({
  page: { padding: 60, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.5 },
  border: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 4,
    padding: 20,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.primary, textAlign: 'center', marginBottom: 14 },
  numero: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  monto: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  para: { marginTop: 8, textAlign: 'justify' },
  highlight: { fontFamily: 'Helvetica-Bold' },
  signWrap: { marginTop: 50, flexDirection: 'row', justifyContent: 'space-around' },
  signCol: { width: 200, alignItems: 'center' },
  signLine: { borderTopWidth: 0.5, borderTopColor: colors.text, width: '100%', marginBottom: 3 },
  signName: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  signRole: { fontSize: 8, color: colors.textMuted, textAlign: 'center' },
});

export function PagarePDF(props: ContractPdfProps) {
  const { contract, client, avales, pagare } = props;
  if (!pagare) return <Document><Page size="LETTER" style={s.page}><Text>Pagaré no capturado.</Text></Page></Document>;
  const b = getBranding();

  const nombreCli = nombreClienteCompleto(client);
  const aval0 = avales[0];
  const montoLetras = numeroALetraSimple(Math.floor(pagare.montoPagare));
  const centavos = Math.round((pagare.montoPagare - Math.floor(pagare.montoPagare)) * 100);

  return (
    <Document title={`Pagaré ${pagare.numeroPagare}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.border}>
          <View style={s.header}>
            <Text style={s.numero}>Pagaré No. {pagare.numeroPagare}</Text>
            <Text style={s.numero}>Folio Contrato: {contract.folio}</Text>
          </View>

          <Text style={s.title}>PAGARÉ</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text>
              Lugar de suscripción:{' '}
              <Text style={s.highlight}>
                {pagare.lugarSuscripcion || 'San Luis Potosí, S.L.P.'}
              </Text>
            </Text>
            <Text>
              Fecha:{' '}
              <Text style={s.highlight}>{fmtFechaLarga(pagare.fechaSuscripcion)}</Text>
            </Text>
          </View>

          <Text style={[s.monto, { marginTop: 6 }]}>Importe: {fmtMoneySigned(pagare.montoPagare)} M.N.</Text>

          <Text style={s.para}>
            Por el presente <Text style={s.highlight}>PAGARÉ</Text>, el(los) suscritor(es)
            promete(n) incondicionalmente pagar a la orden de{' '}
            <Text style={s.highlight}>{b.empresa.razonSocial}</Text>, en su domicilio
            ubicado en {b.contacto.direccion}, o en el lugar que ésta señale, la suma de{' '}
            <Text style={s.highlight}>{fmtMoneySigned(pagare.montoPagare)}</Text>{' '}
            ({montoLetras} PESOS {centavos.toString().padStart(2, '0')}/100 M.N.), correspondiente a la renta
            global del contrato de Arrendamiento Financiero folio{' '}
            <Text style={s.highlight}>{contract.folio}</Text> celebrado entre las partes,
            cuyo vencimiento es el día{' '}
            <Text style={s.highlight}>{fmtFechaLarga(pagare.fechaVencimiento)}</Text>.
          </Text>

          <Text style={s.para}>
            Este pagaré se suscribe en garantía de las obligaciones derivadas del contrato
            de arrendamiento financiero antes referido, sin que su entrega constituya
            dación en pago ni pago de las rentas o sus parcialidades. La transmisión del
            mismo implicará el traspaso de los derechos de crédito y demás derechos
            accesorios derivados del Contrato en la proporción correspondiente.
          </Text>

          <Text style={s.para}>
            En caso de mora, el suscritor pagará intereses moratorios calculados al{' '}
            <Text style={s.highlight}>
              {(((contract.tasaMoratoria ?? contract.tasaAnual * 2) * 100) % 1 === 0
                ? ((contract.tasaMoratoria ?? contract.tasaAnual * 2) * 100).toFixed(0)
                : ((contract.tasaMoratoria ?? contract.tasaAnual * 2) * 100).toFixed(2))}
              %
            </Text>{' '}
            anual sobre el importe vencido, dividido entre 360 días por los días
            transcurridos en mora. EL DEUDOR SOLIDARIO Y/O AVALISTA se obliga
            solidariamente al cumplimiento de las obligaciones derivadas del presente
            pagaré, renunciando a los beneficios de orden, excusión y división conforme a
            los artículos 1988, 2814 y 2815 del Código Civil Federal.
          </Text>

          <Text style={s.para}>
            Para todo lo relativo a la interpretación y cumplimiento del presente pagaré,
            las partes se someten expresamente a la jurisdicción de los tribunales
            competentes de la ciudad de San Luis Potosí, S.L.P., renunciando a cualquier
            otro fuero que pudiera corresponderles.
          </Text>

          <View style={s.signWrap}>
            <View style={s.signCol}>
              <View style={s.signLine} />
              <Text style={s.signName}>{nombreCli}</Text>
              <Text style={s.signRole}>SUSCRIPTOR — LA ARRENDATARIA</Text>
            </View>
            {aval0 && (
              <View style={s.signCol}>
                <View style={s.signLine} />
                <Text style={s.signName}>{nombreAvalCompleto(aval0)}</Text>
                <Text style={s.signRole}>OBLIGADO SOLIDARIO Y/O AVALISTA</Text>
              </View>
            )}
          </View>

          {avales.length > 1 && (
            <View style={[s.signWrap, { marginTop: 30 }]}>
              {avales.slice(1).map((a) => (
                <View style={s.signCol} key={a.orden}>
                  <View style={s.signLine} />
                  <Text style={s.signName}>{nombreAvalCompleto(a)}</Text>
                  <Text style={s.signRole}>OBLIGADO SOLIDARIO Y/O AVALISTA ({a.orden})</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
