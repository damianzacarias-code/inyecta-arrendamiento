/**
 * Contrato de Arrendamiento FINANCIERO — PDF
 * ----------------------------------------------------------------
 * Texto LITERAL del template
 * `CONTRATO DE ARRENDAMIENTO FINANCIERO_Correcciones_FSMP_ENE2026.docx`
 * que entregó Damián el 27-04-2026, con los placeholders sustituidos
 * por los datos del Contract + Client + Avales + Proveedor + Pagaré.
 *
 * Diferencias clave vs. ContratoPuroPDF:
 *   • Cláusula QUINTA con tres OPCIONES TERMINALES (compra residual /
 *     prórroga / participación en venta a tercero) en lugar de
 *     opciones de devolución/renovación.
 *   • Cláusula DÉCIMA TERCERA exige PAGARÉ a la orden de la
 *     arrendadora — anexo separado generado por PagarePDF.
 *   • Distingue Capital, Intereses Ordinarios y Saldo Insoluto.
 *   • Cláusula NOVENA habla de Comisión por Apertura.
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { colors } from './tokens';
import { getBranding } from '@/lib/branding';
import {
  type ContractPdfProps,
  nombreClienteCompleto,
  nombreAvalCompleto,
  direccionUnaLinea,
  fmtFechaLarga,
  numeroALetraSimple,
} from './contractTypes';

const s = StyleSheet.create({
  page: {
    paddingTop: 80, paddingBottom: 50, paddingHorizontal: 50,
    fontSize: 9, color: colors.text, fontFamily: 'Helvetica', lineHeight: 1.35,
  },
  headerWrap: {
    position: 'absolute', top: 22, left: 50, right: 50,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: colors.primary, paddingBottom: 6,
  },
  headerLogo: { width: 60, height: 40, objectFit: 'contain' },
  headerTextWrap: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary },
  headerSub: { fontSize: 7.5, color: colors.textMuted, marginTop: 1 },
  footer: {
    position: 'absolute', bottom: 22, left: 50, right: 50,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7.5, color: colors.textMuted,
    borderTopWidth: 0.3, borderTopColor: colors.rowBorder, paddingTop: 4,
  },
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 4, marginBottom: 12, color: colors.primary },
  h2: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 12, marginBottom: 6 },
  clauseTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 2 },
  declTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 2 },
  inciso: { marginTop: 2, marginLeft: 12, textAlign: 'justify' },
  para: { marginTop: 3, textAlign: 'justify' },
  signaturesWrap: { marginTop: 30 },
  signatureBlock: { marginTop: 28, alignItems: 'center' },
  signatureLine: { borderTopWidth: 0.5, borderTopColor: colors.text, width: 280, marginBottom: 2 },
  signatureName: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  signatureRole: { fontSize: 8, color: colors.textMuted },
});

function Header({ folio }: { folio: string }) {
  const b = getBranding();
  return (
    <View style={s.headerWrap} fixed>
      <Image src="/brand/inyecta-logo.png" style={s.headerLogo} />
      <View style={s.headerTextWrap}>
        <Text style={s.headerTitle}>{b.empresa.razonSocial}</Text>
        <Text style={s.headerSub}>Contrato de Arrendamiento Financiero · Folio {folio}</Text>
      </View>
    </View>
  );
}

function Footer({ folio }: { folio: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>Folio {folio}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export function ContratoFinancieroPDF(props: ContractPdfProps) {
  const { contract, client, avales, folioCondusef } = props;
  const b = getBranding();

  const nombreCli = nombreClienteCompleto(client);
  const tasaOrd = (contract.tasaAnual * 100);
  const tasaOrdPct = (tasaOrd % 1 === 0 ? tasaOrd.toFixed(0) : tasaOrd.toFixed(2));
  const plazoLetra = numeroALetraSimple(contract.plazo);
  const fechaFirma = fmtFechaLarga(contract.fechaFirma);
  const direccionArrendadora = b.contacto.direccion;
  const direccionCliente = direccionUnaLinea(client) || '__________';
  const aval0 = avales[0];
  const direccionAval = aval0 ? direccionUnaLinea(aval0) || '__________' : '__________';
  const diaPago = contract.diaPagoMensual ?? (contract.fechaInicio ? new Date(contract.fechaInicio as Date).getDate() : null);

  return (
    <Document title={`Contrato Arrendamiento Financiero ${contract.folio}`}>
      <Page size="LETTER" style={s.page}>
        <Header folio={contract.folio} />
        <Footer folio={contract.folio} />

        <Text style={s.h1}>CONTRATO DE ARRENDAMIENTO FINANCIERO</Text>

        {/* Proemio */}
        <Text style={s.para}>
          Contrato de Arrendamiento Financiero (en lo sucesivo "EL CONTRATO") que celebran
          por una parte,{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{b.empresa.razonSocial}</Text>,
          representada en este acto por el C.{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>SERGIO BEDOLLA MARTÍNEZ</Text>,
          (en lo sucesivo "LA ARRENDADORA"), y por otra parte,{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{nombreCli || '[NOMBRE DE LA ARRENDATARIA]'}</Text>,
          (en lo sucesivo "LA ARRENDATARIA"); además comparece el/la C.{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{aval0 ? nombreAvalCompleto(aval0) : '[NOMBRE DEL SOLIDARIO]'}</Text>,
          por su propio derecho o por conducto de su representante legal, en calidad de
          DEUDOR SOLIDARIO Y/O AVALISTA, (en lo sucesivo "EL DEUDOR SOLIDARIO Y/O AVALISTA"),
          al tenor de las siguientes declaraciones y cláusulas:
        </Text>

        <Text style={s.h2}>DECLARACIONES</Text>

        {/* I. ARRENDADORA */}
        <Text style={s.declTitle}>I. Declara LA ARRENDADORA:</Text>
        <Text style={s.inciso}>
          A) Que es una Sociedad Anónima de Capital Variable, Sociedad Financiera de Objeto
          Múltiple, Entidad No Regulada, constituida mediante Escritura Pública número
          treinta y seis mil quinientos cincuenta y uno, tomo número milésimo décimo segundo
          con fecha nueve de octubre del año dos mil dieciocho, ante la fe del Licenciado
          Ulises Artolózaga Stahl, Notario Público Adscrito a la Notaría Pública número Diez,
          de la cual es Titular el Licenciado Francisco Artolózaga Noriega, con ejercicio en
          el Primer Distrito Judicial del Estado de San Luis Potosí, e inscrita en el
          Registro Público de Comercio bajo el Folio Mercantil Electrónico N-2019008061.
        </Text>
        <Text style={s.inciso}>
          B) Que su Representante Legal cuenta con los poderes y facultades suficientes para
          representarla en este acto jurídico, lo cual acredita con la escritura citada,
          mismos que a la fecha no le han sido limitados ni revocados.
        </Text>
        <Text style={s.inciso}>
          C) En virtud de tratarse de una Entidad No Regulada y en cumplimiento al Artículo
          87-J de la Ley General de Organizaciones y Actividades Auxiliares del Crédito, no
          requiere de la autorización de la Secretaría de Hacienda y Crédito Público, y está
          sujeta a la supervisión y vigilancia de la Comisión Nacional Bancaria y de Valores
          sólo para efectos de lo establecido en el artículo 56 de la misma Ley.
        </Text>
        <Text style={s.inciso}>
          D) Que se encuentra inscrita en el Registro Federal de Contribuyentes bajo la
          clave FSC181009SP9.
        </Text>
        <Text style={s.inciso}>
          E) Que señala como domicilio fiscal el ubicado en {direccionArrendadora}.
        </Text>
        <Text style={s.inciso}>
          F) Que el presente contrato se encuentra inscrito en el Registro de Contratos de
          Adhesión con el número: {folioCondusef || '[FOLIO CONDUSEF]'}.
        </Text>
        <Text style={s.inciso}>
          G) Que es su voluntad otorgar en arrendamiento financiero a favor de LA
          ARRENDATARIA el bien descrito en el presente Contrato.
        </Text>

        {/* II. ARRENDATARIA */}
        <Text style={s.declTitle}>II. Declara LA ARRENDATARIA:</Text>
        {client.tipo === 'PM' ? (
          <>
            <Text style={s.inciso}>
              A) Que es una sociedad mercantil debidamente constituida, conforme se
              desprende de la Escritura Pública número {client.actaConstitutiva || '[NÚMERO]'} de
              fecha {fmtFechaLarga(client.fechaConstitucion)}, otorgada ante{' '}
              {client.notarioConstNombre || '[NOTARIO]'}, titular de la Notaría Pública
              número {client.notarioConstNumero || '[NÚMERO]'}, con ejercicio en{' '}
              {client.notarioConstLugar || '[LUGAR]'}, cuyo primer testimonio quedó inscrito
              en el Registro Público de Comercio bajo el Folio Mercantil Electrónico número{' '}
              {client.folioMercantil || '[FME]'}. Y se encuentra inscrita en el Registro
              Federal de Contribuyentes bajo la clave {client.rfc || '[RFC]'}.
            </Text>
            <Text style={s.inciso}>
              B) Que su representante legal el/la C.{' '}
              {client.representanteLegalData
                ? [client.representanteLegalData.nombre, client.representanteLegalData.apellidoPaterno, client.representanteLegalData.apellidoMaterno].filter(Boolean).join(' ')
                : '[REPRESENTANTE LEGAL]'}
              , cuenta con los poderes y facultades suficientes para representarla en este
              acto jurídico, mismos que a la fecha no le han sido limitados ni revocados
              {client.representanteLegalData?.poderEscrituraNumero
                ? `, conforme a la escritura pública número ${client.representanteLegalData.poderEscrituraNumero}` +
                  (client.representanteLegalData.poderEscrituraFecha
                    ? ` de fecha ${fmtFechaLarga(client.representanteLegalData.poderEscrituraFecha)}`
                    : '')
                : ''}.
            </Text>
          </>
        ) : (
          <>
            <Text style={s.inciso}>
              A) Ser mayor de edad, de nacionalidad mexicana, con pleno goce y ejercicio de
              sus derechos y facultades, y con capacidad suficiente para obligarse en los
              términos del presente CONTRATO.
            </Text>
            <Text style={s.inciso}>
              B) Que se encuentra inscrito en el Registro Federal de Contribuyentes bajo la
              clave {client.rfc || '[RFC]'}.
            </Text>
          </>
        )}
        <Text style={s.inciso}>
          C) Que se encuentra al corriente en el pago de sus impuestos Federales, Estatales
          y Municipales; y que a la fecha no existen conflictos laborales, ni adeudos
          pendientes con ninguna autoridad federal o local, ni reclamaciones civiles,
          mercantiles, penales o laborales en su contra.
        </Text>
        <Text style={s.inciso}>D) Que se encuentra al corriente en el cumplimiento de sus obligaciones fiscales y legales.</Text>
        <Text style={s.inciso}>E) Que su domicilio se ubica en {direccionCliente}.</Text>
        <Text style={s.inciso}>
          F) Que tiene interés en recibir en arrendamiento financiero el bien objeto de este
          Contrato para fines lícitos y productivos en virtud de su actividad económica.
        </Text>
        <Text style={s.inciso}>
          G) Que cuenta con la capacidad financiera y solvencia económica suficientes para
          cumplir con todas las obligaciones de pago derivadas del presente Contrato.
        </Text>
        <Text style={s.inciso}>
          H) Que ha seleccionado el bien y al proveedor del mismo, liberando a LA ARRENDADORA
          de cualquier responsabilidad sobre la idoneidad, funcionalidad o vicios ocultos del
          bien.
        </Text>

        {/* III. AVAL */}
        <Text style={s.declTitle}>III. Declara EL DEUDOR SOLIDARIO Y/O AVALISTA:</Text>
        <Text style={s.inciso}>
          A) Que conoce el contenido del presente Contrato y acepta libremente constituirse
          como Deudor Solidario y/o Avalista de todas y cada una de las obligaciones a cargo
          de LA ARRENDATARIA, renunciando a los beneficios de orden, excusión y división.
        </Text>
        <Text style={s.inciso}>B) Que su domicilio se ubica en {direccionAval}.</Text>

        {/* CLÁUSULAS */}
        <Text style={s.h2}>CLÁUSULAS</Text>

        <Text style={s.clauseTitle}>PRIMERA. DEFINICIONES.</Text>
        <Text style={s.para}>
          Para la correcta interpretación y efectos legales del presente Contrato, los
          siguientes términos iniciados con mayúscula tendrán el significado que se les
          atribuye a continuación:
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Ad-Corpus:</Text> Condición de
          aceptación de los Bienes Arrendados en la cual LA ARRENDATARIA declara recibirlos
          en el estado físico y mecánico en que se encuentran, asumiendo cualquier
          diferencia en medidas o vicios ocultos.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Capital:</Text> Es el valor de
          adquisición de los Bienes Arrendados pagado por LA ARRENDADORA a un proveedor, y
          que constituye la base principal para el cálculo de las Rentas y el Monto a
          Financiar.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Carátula:</Text> Documento anexo
          que forma parte integrante del Contrato, donde se consignan plazos, montos, tasas,
          comisiones y el valor de las Opciones Terminales.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Intereses Ordinarios:</Text> El
          costo financiero pactado que se aplica sobre el Saldo Insoluto del Monto a
          Financiar, pagadero de forma periódica como parte de la Renta.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Intereses Moratorios:</Text> Tasa
          sancionatoria aplicable en caso de incumplimiento puntual.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>LGTOC:</Text> La Ley General de
          Títulos y Operaciones de Crédito vigente en México.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Monto a Financiar:</Text> La suma
          total que resulta del Capital más otros conceptos (comisiones, seguros, etc.) que
          se especifiquen en la Carátula como financiables.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Renta:</Text> El pago periódico y
          obligatorio que LA ARRENDATARIA debe cubrir a LA ARRENDADORA. Se compone de la
          parte proporcional de Capital, Intereses Ordinarios y, en su caso, IVA.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Saldo Insoluto:</Text> Es el monto
          total del Monto a Financiar pendiente de pago en un momento determinado.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Tabla de Amortización:</Text> El
          documento anexo que detalla el calendario de pagos, desglosando cada Renta en sus
          componentes de capital, intereses e impuestos.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Valor Residual:</Text> Monto
          estipulado en la Carátula que LA ARRENDATARIA deberá cubrir en caso de ejercer la
          opción de compra al término del plazo forzoso, conforme a lo dispuesto por el
          artículo 410 de la LGTOC.
        </Text>

        <Text style={s.clauseTitle}>SEGUNDA. OBJETO.</Text>
        <Text style={s.para}>
          LA ARRENDADORA se obliga a adquirir el bien descrito en la Carátula anexa al
          presente contrato, para conceder su uso y goce temporal a LA ARRENDATARIA. Por
          tanto, LA ARRENDADORA otorga en Arrendamiento Financiero el bien citado, el cual
          es aceptado por LA ARRENDATARIA conforme se haya pactado en la Carátula.
        </Text>

        <Text style={s.clauseTitle}>TERCERA. ENTREGA Y ACEPTACIÓN DEL BIEN.</Text>
        <Text style={s.para}>
          El bien será entregado en{' '}
          {contract.lugarEntregaBien || direccionCliente || '[lugar de entrega]'}, contra
          firma de acta de entrega-recepción. LA ARRENDATARIA reconoce haber inspeccionado
          el bien y declara recibirlo "AD-CORPUS" y a su entera satisfacción. A partir de la
          firma del acta, asume todos los riesgos inherentes a LOS BIENES ARRENDADOS,
          liberando a LA ARRENDADORA de cualquier responsabilidad al respecto.
        </Text>

        <Text style={s.clauseTitle}>CUARTA. DESTINO DEL BIEN Y LUGAR DE USO.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a destinar LOS BIENES ARRENDADOS única y exclusivamente
          para fines lícitos y productivos. El uso y goce de los bienes deberá realizarse
          dentro del territorio nacional, salvo autorización previa y por escrito de LA
          ARRENDADORA.
        </Text>

        <Text style={s.clauseTitle}>QUINTA. PLAZO Y OPCIONES TERMINALES.</Text>
        <Text style={s.para}>
          El presente contrato tendrá un plazo forzoso de {contract.plazo} ({plazoLetra})
          meses a partir de la entrega de LOS BIENES ARRENDADOS. Al concluir el plazo
          forzoso del Contrato y habiendo cumplido todas sus obligaciones, LA ARRENDATARIA
          deberá adoptar una de las siguientes opciones terminales:
        </Text>
        <Text style={s.inciso}>
          I. Comprar LOS BIENES ARRENDADOS a un precio inferior a su valor de adquisición,
          fijado en la Carátula como Valor Residual.
        </Text>
        <Text style={s.inciso}>
          II. Prorrogar el plazo del Contrato por un periodo adicional, pagando una Renta
          inferior a la pactada originalmente, conforme a las bases que las Partes acuerden
          por escrito.
        </Text>
        <Text style={s.inciso}>
          III. Participar con LA ARRENDADORA en el precio de la venta de LOS BIENES
          ARRENDADOS a un tercero, en las proporciones y términos que se convengan en el
          convenio de venta. LA ARRENDATARIA deberá notificar por escrito su elección con
          una antelación de por lo menos un mes al vencimiento del Contrato, siendo
          responsable por los daños y perjuicios que cause su omisión.
        </Text>

        <Text style={s.clauseTitle}>SEXTA. PAGO DE RENTAS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA cubrirá rentas mensuales conforme a la tabla de amortización
          anexa. La obligación de pago es absoluta, incondicional y no sujeta a excepción.
          El pago se realizará en el domicilio de LA ARRENDADORA ubicado en{' '}
          {direccionArrendadora}, mediante cheque certificado o de caja, o a través de
          transferencia electrónica o depósito a la cuenta CLABE {b.banco.clabe || '[CLABE]'}{' '}
          de {b.banco.nombre || '[BANCO]'}, a nombre de{' '}
          {b.banco.beneficiario || b.empresa.razonSocial}.
        </Text>

        <Text style={s.clauseTitle}>SÉPTIMA. PAGOS ANTICIPADOS Y ADELANTADOS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA podrá realizar pagos superiores a las obligaciones exigibles a su
          cargo en la fecha de pago respectiva, bajo dos modalidades: (I) PAGOS ANTICIPADOS:
          destinados a cubrir el saldo insoluto del Monto a Financiar — el importe se
          aplicará al saldo insoluto y al IVA correspondiente, y las Rentas por vencer se
          reducirán en la misma proporción respetando el Plazo Forzoso. Cada vez que se
          reciba un pago anticipado, LA ARRENDADORA entregará a LA ARRENDATARIA una tabla
          de amortización actualizada. (II) PAGOS ADELANTADOS: LA ARRENDATARIA podrá
          solicitar por escrito que los excedentes se apliquen a cubrir las Rentas
          periódicas inmediatas siguientes.
        </Text>
        <Text style={s.para}>
          En caso de existir adeudos vencidos al momento del pago anticipado, se aplicará
          la siguiente prelación: (i) Impuestos, (ii) gastos y primas, (iii) intereses
          moratorios, (iv) intereses ordinarios vencidos, (v) saldo insoluto vencido, (vi)
          intereses ordinarios vigentes, (vii) saldo insoluto vigente, (viii) seguros
          aplicables, más el IVA correspondiente.
        </Text>
        <Text style={s.para}>
          Las tasas de interés pactadas no podrán ser modificadas unilateralmente por LA
          ARRENDADORA, salvo reestructuración con consentimiento expreso y por escrito de
          LA ARRENDATARIA.
        </Text>

        <Text style={s.clauseTitle}>OCTAVA. INTERESES ORDINARIOS Y MORATORIOS.</Text>
        <Text style={s.para}>
          A) Intereses ordinarios. LA ARRENDATARIA se obliga a pagar a LA ARRENDADORA
          intereses ordinarios sobre el SALDO INSOLUTO del arrendamiento a la tasa de
          interés anual fija equivalente al {tasaOrdPct}% anual, calculados en cada fecha
          de pago sobre una base de 360 (trescientos sesenta) días.
        </Text>
        <Text style={s.para}>
          La fecha de pago de interés y capital será cada día{' '}
          {diaPago ? String(diaPago).padStart(2, '0') : 'XX'} del mes, contados a partir de
          la disposición. En caso de día inhábil, el pago deberá efectuarse al Día Hábil
          siguiente sin generar moratorios. A los importes resultantes se les adicionará el
          Impuesto al Valor Agregado en términos del artículo 15 de la Ley del IVA.
        </Text>
        <Text style={s.para}>
          B) Intereses moratorios. En caso de incumplimiento puntual, la cantidad no pagada
          devengará intereses moratorios a partir del día siguiente al vencimiento. La tasa
          moratoria anual fija resulta de multiplicar por 2 (dos) la tasa de interés
          ordinaria, dividiéndose entre 360 días y multiplicada por los días transcurridos
          en mora. A los importes se les adicionará el IVA correspondiente.
        </Text>

        <Text style={s.clauseTitle}>NOVENA. COMISIONES Y GASTOS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA cubrirá las comisiones y gastos derivados del contrato. Cualquier
          gasto en que incurra LA ARRENDADORA para hacer cumplir este contrato, incluidos
          honorarios de abogados, será a cargo de LA ARRENDATARIA.
        </Text>
        <Text style={s.para}>
          Comisión por apertura: LA ARRENDATARIA, por única ocasión, pagará a LA
          ARRENDADORA la cantidad señalada en la Carátula. El supuesto de que dicha Comisión
          por Apertura vaya a ser financiada se hará conforme a la Carátula del presente
          contrato y la Tabla de Amortización anexa al mismo, más el IVA correspondiente.
        </Text>
        <Text style={s.para}>
          LA ARRENDADORA no podrá crear ni aumentar nuevas comisiones o conceptos de pago
          ajenas a las establecidas por el presente contrato.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA. LICENCIAS, PERMISOS Y REGISTROS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a contar, tramitar y obtener las licencias, refrendos,
          permisos, concesiones, tenencias, registros y demás documentos y autorizaciones
          necesarias derivadas de la propiedad, tenencia y uso de LOS BIENES ARRENDADOS, así
          como cubrir el pago puntual de los mismos.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA PRIMERA. DEPÓSITO EN GARANTÍA.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA entregará en Depósito a LA ARRENDADORA la cantidad señalada en los
          Anexos como garantía del cumplimiento de las obligaciones a su cargo. De
          verificarse dicho cumplimiento el Depósito se aplicará al último Pago Parcial o,
          en su caso, al monto de la opción de compra que se establezca en los Anexos, a
          elección de LA ARRENDATARIA.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA autoriza a LA ARRENDADORA a aplicar el Depósito al pago de
          cualquier saldo vencido. En tal caso, LA ARRENDATARIA se obliga a reconstituir el
          Depósito al día hábil siguiente a la notificación correspondiente. La falta de
          reembolso generará Intereses Moratorios. El Depósito no generará intereses a favor
          de LA ARRENDATARIA.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA SEGUNDA. FECHAS DE ACREDITAMIENTO DE PAGO.</Text>
        <Text style={s.para}>
          Efectivo y cheque del banco de la cuenta receptora: mismo día. Cheque de otro
          banco: antes de las 16:00 hrs, día hábil bancario siguiente; después de las 16:00
          hrs, segundo día hábil bancario siguiente. Domiciliación: fecha límite acordada.
          Transferencia SPEI: mismo día.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA TERCERA. TÍTULO DE CRÉDITO EN GARANTÍA.</Text>
        <Text style={s.para}>
          Para garantizar el cumplimiento de todas y cada una de las obligaciones
          pecuniarias a su cargo, LA ARRENDATARIA y EL OBLIGADO SOLIDARIO Y/O AVALISTA
          suscriben a la orden de LA ARRENDADORA un pagaré por el importe total del precio
          pactado por concepto de renta global. Dicho título de crédito tendrá como fecha
          de vencimiento la misma fecha de terminación del plazo forzoso de este Contrato.
        </Text>
        <Text style={s.para}>
          En el texto del pagaré se hará constar de forma inequívoca su vinculación con el
          presente instrumento. Las partes acuerdan que la suscripción y entrega de dicho
          pagaré no constituye dación en pago ni pago de las rentas. La transmisión del
          pagaré implicará el traspaso de los derechos de crédito y demás derechos
          accesorios derivados de este Contrato.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA CUARTA. INSCRIPCIÓN.</Text>
        <Text style={s.para}>
          Para que el presente Contrato surta plenos efectos frente a terceros, LAS PARTES
          convienen en que deberá ser inscrito en la Sección Única del Registro Único de
          Garantías Mobiliarias del Registro Público de Comercio, corriendo los gastos de
          dicha inscripción a cargo de LA ARRENDATARIA.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA QUINTA. DEUDOR SOLIDARIO Y/O AVALISTA.</Text>
        <Text style={s.para}>
          Para garantizar el cumplimiento total, puntual y cabal de todas las obligaciones
          a cargo de LA ARRENDATARIA, comparece y se obliga EL DEUDOR SOLIDARIO Y/O
          AVALISTA, quien por virtud de este acto se constituye como obligado principal,
          deudor directo y garante de la totalidad de las obligaciones de pago contenidas
          tanto en el presente Contrato como en el pagaré suscrito a la par de este.
        </Text>
        <Text style={s.para}>
          Renuncia de forma expresa e irrevocable a los beneficios de orden, excusión y
          división, de conformidad con los artículos 1988, 2814 y 2815 del Código Civil
          Federal. LA ARRENDADORA podrá exigir el pago total directamente en su contra, sin
          necesidad de demandar o ejecutar previamente a LA ARRENDATARIA. Adicionalmente,
          se obliga a no enajenar, gravar o de cualquier forma limitar el dominio de sus
          bienes inmuebles sin el consentimiento previo y por escrito de LA ARRENDADORA,
          mientras exista cualquier saldo insoluto.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA SEXTA. RESCISIÓN ANTICIPADA.</Text>
        <Text style={s.para}>
          LA ARRENDADORA podrá dar por vencido anticipadamente EL CONTRATO y exigir el pago
          total en caso de: falta de pago puntual; uso ilícito o distinto al pactado;
          deterioro grave por negligencia; concurso mercantil de LA ARRENDATARIA;
          incumplimiento de cualquier obligación de hacer o no hacer; información falsa;
          embargo o decomiso de los bienes; falta de contratación o vigencia de seguro
          (incluyendo dentro de los 3 días siguientes a la firma); negativa injustificada a
          recibir los bienes; uso de partes/refacciones no autorizadas; embargo o gravamen
          de los bienes; concurso o quiebra; incumplimiento en otros contratos no subsanado
          en 5 días; impago de adeudos fiscales o cuotas obrero-patronales; juicios laborales
          colectivos o solicitudes de huelga; procedimiento de disolución; negativa a
          inspecciones; en caso de PM, fusión o escisión sin consentimiento; falta de aviso
          de afectación física o jurídica; traslado fuera de la República sin autorización;
          y en general, cualquier incumplimiento.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA SÉPTIMA. POSESIÓN EN CASO DE INCUMPLIMIENTO.</Text>
        <Text style={s.para}>
          LA ARRENDADORA podrá solicitar judicialmente la posesión de LOS BIENES ARRENDADOS,
          quedando facultada para darlos en arrendamiento puro a un tercero, enajenar o
          disponer de ellos.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA OCTAVA. OBLIGACIONES DE HACER.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a: proporcionar información financiera y operativa
          actualizada; mantener LOS BIENES ARRENDADOS en óptimas condiciones; permitir
          inspecciones periódicas; pagar todos los impuestos, derechos y multas asociados;
          notificar cambio de domicilio con 30 días de anticipación; notificar de inmediato
          cualquier siniestro, embargo o afectación; notificar dentro de 15 días naturales
          la existencia de acciones, demandas o procedimientos en su contra; mantener en
          buen estado la empresa y su giro comercial; emplear refacciones originales;
          dotar a los bienes de los requerimientos técnicos para su uso; reembolsar
          cantidades pagadas por cuenta de LA ARRENDATARIA; y cumplir con todas las
          obligaciones del Contrato.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA NOVENA. OBLIGACIONES DE NO HACER.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a no: destinar los bienes a fines ilícitos; ceder o
          subarrendar sin consentimiento; gravar los bienes; alterar características
          esenciales o de identificación; trasladarlos sin autorización; afectar o gravar
          los bienes en cualquier forma; otorgar préstamos a terceros (excepto a sus
          proveedores y empleados conforme a ley); en caso de PM, fusionarse, escindirse,
          cambiar estructura accionaria sustancialmente, repartir dividendos o reducir
          capital social.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA. RIESGOS Y VICIOS OCULTOS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA reconoce que ha seleccionado libremente los bienes y al
          proveedor. Todos los riesgos por pérdida, daño o vicios ocultos serán asumidos
          íntegramente por LA ARRENDATARIA a partir de la recepción. Para el solo efecto de
          que LA ARRENDATARIA pueda reclamar directamente al proveedor o fabricante, LA
          ARRENDADORA cede en este acto los derechos y acciones que le corresponden como
          compradora, sin que esto implique transferencia de la propiedad de LOS BIENES
          ARRENDADOS, cuya propiedad exclusiva corresponde en todo momento a LA
          ARRENDADORA.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA PRIMERA. TERMINACIÓN ANTICIPADA.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA podrá solicitar la terminación anticipada en cualquier momento,
          siempre que: (I) cuente con 10 días hábiles posteriores a la firma para cancelar
          sin responsabilidad, siempre que no haya hecho disposición de los recursos y
          mantenga los bienes en el estado entregado; (II) esté al corriente en sus
          obligaciones; (III) liquide en una sola exhibición la totalidad del adeudo a la
          fecha (rentas vencidas y accesorios + 100% del SALDO INSOLUTO + IVA);
          (IV) entregue los bienes en las condiciones pactadas, considerando desgaste
          natural y mantenimientos preventivos cumplidos. Los gastos de traslado serán por
          cuenta de LA ARRENDATARIA. Una vez cubiertos los adeudos, LA ARRENDADORA pondrá a
          disposición el estado de cuenta de cierre dentro de 10 días hábiles posteriores y
          reportará el cierre a Sociedades de Información Crediticia dentro de 5 días
          hábiles posteriores al pago total.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA SEGUNDA. REPOSICIÓN Y PÉRDIDA TOTAL.</Text>
        <Text style={s.para}>
          En caso de pérdida total, destrucción o siniestro, aun por caso fortuito o fuerza
          mayor, LA ARRENDATARIA no quedará liberada de sus obligaciones de pago.
          Cualquier indemnización se aplicará a favor de LA ARRENDADORA, quien decidirá su
          destino: liquidación del saldo insoluto o adquisición de bienes similares. Si la
          indemnización no cubre el saldo insoluto o el valor de reposición, LA
          ARRENDATARIA cubrirá la diferencia dentro de 30 días naturales siguientes a la
          notificación. El incumplimiento será causa de vencimiento anticipado.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA TERCERA. ESTADOS DE CUENTA.</Text>
        <Text style={s.para}>
          LA ARRENDADORA emitirá estados de cuenta trimestrales gratuitos, enviados al
          domicilio o medio señalado en la carátula. Los estados de cuenta harán prueba
          plena en juicio salvo objeción por escrito dentro de 10 días naturales
          siguientes a su recepción.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA CUARTA. IMPUESTOS.</Text>
        <Text style={s.para}>
          Todos los impuestos, derechos y contribuciones, presentes o futuros, que se
          deriven de este contrato, serán a cargo de LAS PARTES respectivamente de sus
          obligaciones y en términos de la legislación fiscal vigente.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA QUINTA. MODIFICACIONES AL CONTRATO.</Text>
        <Text style={s.para}>
          Toda modificación deberá formalizarse mediante convenio por escrito, firmado por
          ambas partes.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA SEXTA. CASO FORTUITO.</Text>
        <Text style={s.para}>
          De conformidad con la LGTOC, la pérdida parcial o total de los bienes objeto de
          este contrato, aun por caso fortuito o fuerza mayor, no libera a LA ARRENDATARIA
          de la obligación de cubrir íntegramente la contraprestación pactada y los demás
          cargos financieros. LA ARRENDATARIA continuará obligada a cubrir puntualmente las
          rentas y demás cantidades a su cargo.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA SÉPTIMA. INSPECCIÓN DEL BIEN.</Text>
        <Text style={s.para}>
          LA ARRENDADORA tendrá derecho a inspeccionar LOS BIENES ARRENDADOS en cualquier
          momento durante horas hábiles. LA ARRENDATARIA se obliga a otorgar todas las
          facilidades necesarias.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA OCTAVA. EJECUTIVIDAD DEL CONTRATO.</Text>
        <Text style={s.para}>
          LAS PARTES convienen que el presente contrato, junto con el estado de cuenta
          certificado por el contador de LA ARRENDADORA, hará prueba plena sobre la relación
          jurídica y el saldo adeudado, pudiendo LA ARRENDADORA iniciar la acción ejecutiva
          correspondiente con base en dichos documentos y/o en el pagaré suscrito en
          garantía.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA NOVENA. CESIÓN DE DERECHOS.</Text>
        <Text style={s.para}>
          LA ARRENDADORA podrá ceder los derechos de crédito derivados de este Contrato sin
          necesidad de autorización de LA ARRENDATARIA. LA ARRENDATARIA no podrá ceder sus
          derechos ni obligaciones sin el consentimiento previo y por escrito de LA
          ARRENDADORA.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA. NOTIFICACIONES.</Text>
        <Text style={s.para}>
          Toda notificación será válida cuando sea entregada por entrega personal con
          acuse de recibo en los domicilios físicos señalados o por correo electrónico a
          las direcciones designadas. LA ARRENDATARIA: {direccionCliente}, correo
          electrónico: {client.email || '__________'}. LA ARRENDADORA: {direccionArrendadora},
          correo electrónico: {b.contacto.email}.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA PRIMERA. ATENCIÓN A USUARIOS Y RECLAMACIONES.</Text>
        <Text style={s.para}>
          En cumplimiento con la Ley de Protección y Defensa al Usuario de Servicios
          Financieros, LA ARRENDADORA cuenta con una UNE: Titular Diana Arteaga López,
          domicilio en {direccionArrendadora}, teléfonos {b.contacto.telefonos}, correo{' '}
          {b.contacto.email}, horario lunes a viernes 09:00 a 18:00. CONDUSEF:
          www.condusef.gob.mx | 55 5340 0999 y 800 999 8080 | asesoria@condusef.gob.mx.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA SEGUNDA. PROTECCIÓN DE DATOS PERSONALES.</Text>
        <Text style={s.para}>
          LA ARRENDADORA tratará los datos personales de LA ARRENDATARIA conforme a la ley
          aplicable.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA TERCERA. ANEXOS.</Text>
        <Text style={s.para}>
          Forman parte integrante de este Contrato los siguientes documentos: a) Carátula
          del Contrato; b) Tabla de amortización de rentas; c) Acta de entrega-recepción del
          bien; d) Pagaré; e) Copia de la póliza de seguro; f) Autorización de consulta de
          buró de crédito e historial crediticio; g) Anexo de Disposiciones Legales;
          h) Aviso de Privacidad.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA CUARTA. JURISDICCIÓN Y LEYES APLICABLES.</Text>
        <Text style={s.para}>
          Para la interpretación y cumplimiento de este Contrato, LAS PARTES se someten a
          las leyes aplicables y a la jurisdicción de los tribunales competentes de la
          ciudad de San Luis Potosí, S.L.P., renunciando a cualquier otro fuero.
        </Text>

        {/* Firmas */}
        <Text style={[s.para, { marginTop: 16 }]}>
          Leído que fue el presente instrumento por las Partes y enteradas de su contenido,
          alcance y efectos legales, lo firman de conformidad en la ciudad de San Luis
          Potosí, S.L.P., a los {fechaFirma}.
        </Text>

        <View style={s.signaturesWrap}>
          <View style={s.signatureBlock}>
            <View style={s.signatureLine} />
            <Text style={s.signatureName}>{b.empresa.razonSocial}</Text>
            <Text style={s.signatureRole}>Por conducto de: C. Sergio Bedolla Martínez</Text>
            <Text style={s.signatureRole}>Representante Legal — LA ARRENDADORA</Text>
          </View>

          <View style={s.signatureBlock}>
            <View style={s.signatureLine} />
            <Text style={s.signatureName}>{nombreCli}</Text>
            <Text style={s.signatureRole}>
              {client.tipo === 'PM' ? 'Por conducto de su Representante Legal' : 'Por su propio derecho'}
              {' — LA ARRENDATARIA'}
            </Text>
          </View>

          {avales.map((aval, idx) => (
            <View key={aval.orden ?? idx} style={s.signatureBlock}>
              <View style={s.signatureLine} />
              <Text style={s.signatureName}>{nombreAvalCompleto(aval)}</Text>
              <Text style={s.signatureRole}>
                Deudor Solidario y/o Avalista{avales.length > 1 ? ` (${aval.orden})` : ''}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
