/**
 * Contrato de Arrendamiento PURO — PDF
 * ----------------------------------------------------------------
 * Texto LITERAL del template `CONTRATO_ARRENDAMIENTO_PURO_INYECTA.docx`
 * que entregó Damián el 27-04-2026, con los placeholders sustituidos
 * por los datos del Contract + Client + Avales.
 *
 * Diseño:
 *   • Carta vertical multipágina con paginación automática.
 *   • Header fijo (logo + razón social) + footer fijo (página X de Y).
 *   • 4 grandes bloques: Proemio · Declaraciones · Cláusulas · Firmas.
 *   • Carátula como anexo separado (CaratulaPDF.tsx) — este componente
 *     se enfoca en el contrato propiamente dicho.
 *
 * Si el .docx cambia (Damián edita el texto), se actualiza este archivo
 * y se hace commit con la diferencia visible. Es deliberadamente
 * verboso para que el control de versiones muestre los cambios legales.
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

// ────────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 80,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontSize: 9,
    color: colors.text,
    fontFamily: 'Helvetica',
    lineHeight: 1.35,
  },

  // Header fijo
  headerWrap: {
    position: 'absolute',
    top: 22,
    left: 50,
    right: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.primary,
    paddingBottom: 6,
  },
  headerLogo: { width: 60, height: 40, objectFit: 'contain' },
  headerTextWrap: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.primary },
  headerSub: { fontSize: 7.5, color: colors.textMuted, marginTop: 1 },
  headerFolio: { fontSize: 8, color: colors.text, fontFamily: 'Helvetica-Bold' },

  // Footer fijo (paginación)
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: colors.textMuted,
    borderTopWidth: 0.3,
    borderTopColor: colors.rowBorder,
    paddingTop: 4,
  },

  // Tipografía
  h1: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
    color: colors.primary,
  },
  h1sub: {
    fontSize: 9,
    fontFamily: 'Helvetica-Oblique',
    textAlign: 'center',
    marginBottom: 12,
    color: colors.textMuted,
  },
  h2: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  clauseTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 2,
  },
  declTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
    marginBottom: 2,
  },
  inciso: {
    marginTop: 2,
    marginLeft: 12,
    textAlign: 'justify',
  },
  para: {
    marginTop: 3,
    textAlign: 'justify',
  },

  // Firmas
  signaturesWrap: { marginTop: 30 },
  signatureBlock: { marginTop: 28, alignItems: 'center' },
  signatureLine: { borderTopWidth: 0.5, borderTopColor: colors.text, width: 280, marginBottom: 2 },
  signatureName: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  signatureRole: { fontSize: 8, color: colors.textMuted },
});

// ────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ────────────────────────────────────────────────────────────────────

function Header({ folio }: { folio: string }) {
  const b = getBranding();
  return (
    <View style={s.headerWrap} fixed>
      <Image src="/brand/inyecta-logo.png" style={s.headerLogo} />
      <View style={s.headerTextWrap}>
        <Text style={s.headerTitle}>{b.empresa.razonSocial}</Text>
        <Text style={s.headerSub}>Contrato de Arrendamiento Puro · Folio {folio}</Text>
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

// ────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────

export function ContratoPuroPDF(props: ContractPdfProps) {
  const { contract, client, avales, folioCondusef } = props;
  const b = getBranding();

  const nombreCli = nombreClienteCompleto(client);
  const tasaMor = (contract.tasaMoratoria ?? contract.tasaAnual * 2) * 100;
  const tasaMorPct = (tasaMor % 1 === 0 ? tasaMor.toFixed(0) : tasaMor.toFixed(2));
  const plazoLetra = numeroALetraSimple(contract.plazo);
  const fechaFirma = fmtFechaLarga(contract.fechaFirma);

  const direccionArrendadora = `${b.contacto.direccion}`;
  const direccionCliente = direccionUnaLinea(client) || '__________';

  const aval0 = avales[0];
  const direccionAval = aval0 ? direccionUnaLinea(aval0) || '__________' : '__________';

  return (
    <Document title={`Contrato Arrendamiento Puro ${contract.folio}`}>
      <Page size="LETTER" style={s.page}>
        <Header folio={contract.folio} />
        <Footer folio={contract.folio} />

        <Text style={s.h1}>CONTRATO DE ARRENDAMIENTO PURO</Text>
        <Text style={s.h1sub}>(en lo sucesivo "EL CONTRATO")</Text>

        {/* ── Proemio ───────────────────────────────────────────── */}
        <Text style={s.para}>
          Contrato de Arrendamiento Puro que celebran por una parte,{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{b.empresa.razonSocial}</Text>,
          representada en este acto por el C.{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>SERGIO BEDOLLA MARTÍNEZ</Text>,
          (en lo sucesivo "LA ARRENDADORA"); y por otra parte,{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{nombreCli || '[NOMBRE DEL ARRENDATARIO]'}</Text>,
          (en lo sucesivo "LA ARRENDATARIA"); además comparece el/la C.{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{aval0 ? nombreAvalCompleto(aval0) : '[NOMBRE DEL DEUDOR SOLIDARIO]'}</Text>,
          por su propio derecho o por conducto de su representante legal, en calidad de
          DEUDOR SOLIDARIO Y/O AVALISTA, (en lo sucesivo "EL DEUDOR SOLIDARIO Y/O AVALISTA"),
          al tenor de las siguientes declaraciones y cláusulas:
        </Text>

        <Text style={s.h2}>DECLARACIONES</Text>

        {/* I. ARRENDADORA */}
        <Text style={s.declTitle}>I. Declara LA ARRENDADORA:</Text>
        <Text style={s.inciso}>
          A) Que es una Sociedad Anónima de Capital Variable, Sociedad Financiera de Objeto
          Múltiple, Entidad No Regulada de conformidad con las leyes de los Estados Unidos
          Mexicanos, constituida mediante Escritura Pública número treinta y seis mil
          quinientos cincuenta y uno, tomo número milésimo décimo segundo, con fecha nueve
          de octubre del año dos mil dieciocho, ante la fe del Licenciado Ulises Artolózaga
          Stahl, Abogado y Notario Público Adscrito a la Notaría Pública número Diez, de la
          cual es Titular el Licenciado Francisco Artolózaga Noriega, con ejercicio en el
          Primer Distrito Judicial del Estado de San Luis Potosí, e inscrita en el Registro
          Público de Comercio bajo el Folio Mercantil Electrónico N-2019008061.
        </Text>
        <Text style={s.inciso}>
          B) Que su Representante Legal cuenta con los poderes y facultades suficientes para
          representarla en este acto jurídico, conforme a la escritura pública antes referida,
          mismos que a la fecha no le han sido limitados ni revocados.
        </Text>
        <Text style={s.inciso}>
          C) Que en virtud de tratarse de una Entidad No Regulada y en cumplimiento al
          artículo 87-J vigente a la fecha de la Ley General de Organizaciones y Actividades
          Auxiliares del Crédito, no requiere de la autorización de la Secretaría de Hacienda
          y Crédito Público, y está sujeta a la supervisión y vigilancia de la Comisión
          Nacional Bancaria y de Valores, sólo para efectos de lo establecido en el artículo
          56 de la misma Ley.
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
          G) Que es su voluntad otorgar en arrendamiento puro a favor de LA ARRENDATARIA el
          bien descrito en la Carátula del presente Contrato, del cual conserva en todo
          momento la plena propiedad.
        </Text>

        {/* II. ARRENDATARIA */}
        <Text style={s.declTitle}>II. Declara LA ARRENDATARIA:</Text>
        {client.tipo === 'PM' ? (
          <>
            <Text style={s.inciso}>
              A) Que es una sociedad mercantil debidamente constituida y en operación de
              conformidad con las leyes de los Estados Unidos Mexicanos, conforme se desprende
              de la Escritura Pública número {client.actaConstitutiva || '[NÚMERO]'} de fecha{' '}
              {fmtFechaLarga(client.fechaConstitucion)}, otorgada ante{' '}
              {client.notarioConstNombre || '[NOTARIO]'}, titular de la Notaría Pública número{' '}
              {client.notarioConstNumero || '[NÚMERO]'}, con ejercicio en{' '}
              {client.notarioConstLugar || '[LUGAR]'}, cuyo primer testimonio quedó inscrito
              en el Registro Público de Comercio bajo el Folio Mercantil Electrónico número{' '}
              {client.folioMercantil || '[FME]'}. Se encuentra inscrita en el Registro Federal
              de Contribuyentes bajo la clave {client.rfc || '[RFC]'}.
            </Text>
            <Text style={s.inciso}>
              B) Que su representante legal, el/la C.{' '}
              {client.representanteLegalData
                ? [
                    client.representanteLegalData.nombre,
                    client.representanteLegalData.apellidoPaterno,
                    client.representanteLegalData.apellidoMaterno,
                  ].filter(Boolean).join(' ')
                : '[REPRESENTANTE LEGAL]'}
              , cuenta con los poderes y facultades suficientes para representarla en este
              acto jurídico, mismos que a la fecha no le han sido limitados ni revocados
              {client.representanteLegalData?.poderEscrituraNumero
                ? `, según escritura pública número ${client.representanteLegalData.poderEscrituraNumero}` +
                  (client.representanteLegalData.poderEscrituraFecha
                    ? ` de fecha ${fmtFechaLarga(client.representanteLegalData.poderEscrituraFecha)}`
                    : '') +
                  (client.representanteLegalData.poderNotarioNombre
                    ? `, ante la fe de ${client.representanteLegalData.poderNotarioNombre}` +
                      (client.representanteLegalData.poderNotarioNumero
                        ? `, Notario Público número ${client.representanteLegalData.poderNotarioNumero}`
                        : '') +
                      (client.representanteLegalData.poderNotarioLugar
                        ? ` de ${client.representanteLegalData.poderNotarioLugar}`
                        : '')
                    : '')
                : ''}
              .
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
              B) Que se encuentra inscrito/a en el Registro Federal de Contribuyentes bajo la
              clave {client.rfc || '[RFC]'}.
            </Text>
          </>
        )}
        <Text style={s.inciso}>
          C) Que se encuentra al corriente en el pago de sus impuestos Federales, Estatales y
          Municipales, y que a la fecha no existen conflictos laborales, ni adeudos
          pendientes con ninguna autoridad federal o local, ni reclamaciones civiles,
          mercantiles, penales o laborales en su contra.
        </Text>
        <Text style={s.inciso}>D) Que su domicilio se ubica en {direccionCliente}.</Text>
        <Text style={s.inciso}>
          E) Que tiene interés en recibir en arrendamiento puro el bien objeto de este
          Contrato, para su uso y goce conforme a la naturaleza y destino para el que fue
          creado, bajo fines lícitos y en el marco de su actividad económica.
        </Text>
        <Text style={s.inciso}>
          F) Que cuenta con la capacidad financiera y solvencia económica suficientes para
          cumplir con todas las obligaciones de pago derivadas del presente Contrato.
        </Text>

        {/* III. AVAL */}
        <Text style={s.declTitle}>III. Declara EL DEUDOR SOLIDARIO Y/O AVALISTA:</Text>
        <Text style={s.inciso}>
          A) Que conoce el contenido del presente Contrato y acepta libremente constituirse
          como Deudor Solidario y/o Avalista de todas y cada una de las obligaciones a cargo
          de LA ARRENDATARIA, renunciando desde este momento a los beneficios de orden,
          excusión y división.
        </Text>
        <Text style={s.inciso}>B) Que su domicilio se ubica en {direccionAval}.</Text>

        {/* ── CLÁUSULAS ───────────────────────────────────────── */}
        <Text style={s.h2}>CLÁUSULAS</Text>

        <Text style={s.clauseTitle}>PRIMERA. DEFINICIONES.</Text>
        <Text style={s.para}>
          Para la correcta interpretación y efectos legales del presente Contrato, los
          siguientes términos iniciados con mayúscula tendrán el significado que se les
          atribuye a continuación:
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Ad-Corpus:</Text> Condición de
          aceptación del Bien Arrendado en la cual LA ARRENDATARIA declara recibirlo en el
          estado físico y mecánico en que se encuentra, con sus dimensiones y características
          actuales, asumiendo la responsabilidad sobre cualquier diferencia en medidas o
          vicios ocultos, liberando a LA ARRENDADORA de cualquier reclamación al respecto.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Arrendadora:</Text>{' '}
          {b.empresa.razonSocial}, según se define en el proemio del presente instrumento.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Arrendataria:</Text>{' '}
          {nombreCli}, según se define en el proemio del presente instrumento.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Bien Arrendado:</Text> El bien mueble
          cuya propiedad pertenece en todo momento a LA ARRENDADORA y cuyo uso y goce
          temporal se conceden a LA ARRENDATARIA, detallado exhaustivamente en la Carátula.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Carátula:</Text> Documento anexo que
          forma parte integrante del Contrato, en el que se consignan las condiciones
          comerciales específicas de la operación: descripción del Bien Arrendado, plazos,
          montos de renta, depósito en garantía y demás condiciones aplicables.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Contrato:</Text> El presente contrato
          de arrendamiento puro, sus anexos, la Carátula y cualquier convenio modificatorio
          futuro.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Depósito en Garantía:</Text> La
          cantidad entregada por LA ARRENDATARIA a LA ARRENDADORA al inicio de la relación
          contractual, como garantía del cumplimiento de sus obligaciones, conforme al monto
          señalado en la Carátula.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Día Hábil:</Text> Cualquier día de
          lunes a viernes, excluyendo días feriados oficiales en los Estados Unidos
          Mexicanos.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Intereses Moratorios:</Text> Tasa
          de interés sancionatoria aplicable en caso de incumplimiento puntual en el pago de
          las Rentas, calculada conforme a lo estipulado en la Cláusula Octava del presente
          instrumento.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Renta:</Text> El pago mensual,
          periódico y obligatorio que LA ARRENDATARIA debe cubrir a LA ARRENDADORA como
          contraprestación por el uso y goce del Bien Arrendado, en el monto y fechas
          establecidos en la Carátula.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Rentas Extraordinarias:</Text> Los
          cargos que genera LA ARRENDATARIA por retener el Bien Arrendado sin autorización
          una vez concluido el plazo forzoso del Contrato, conforme a la Cláusula Décima
          Tercera.
        </Text>
        <Text style={s.para}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Plazo Forzoso:</Text> El periodo de
          vigencia obligatorio del Contrato, señalado en la Carátula, durante el cual ambas
          partes se obligan a cumplir con sus respectivas obligaciones.
        </Text>

        <Text style={s.clauseTitle}>SEGUNDA. OBJETO.</Text>
        <Text style={s.para}>
          LA ARRENDADORA, en su calidad de propietaria del BIEN ARRENDADO, otorga en
          arrendamiento puro a LA ARRENDATARIA el uso y goce temporal del mismo, conforme a
          las condiciones y características descritas en la Carátula del presente Contrato,
          que se tiene por reproducida como si a la letra se insertase. LA ARRENDATARIA
          acepta recibirlo en los términos señalados, reconociendo que LA ARRENDADORA
          conserva en todo momento la plena propiedad del BIEN ARRENDADO.
        </Text>
        <Text style={s.para}>
          El presente Contrato es de arrendamiento puro y, en consecuencia, no contiene ni
          implica opción de compra alguna a favor de LA ARRENDATARIA. La transmisión de la
          propiedad del BIEN ARRENDADO, de así convenir a las partes, se formalizará en
          instrumento jurídico independiente al término del Plazo Forzoso y a través de la
          figura jurídica que corresponda.
        </Text>

        <Text style={s.clauseTitle}>TERCERA. ENTREGA Y ACEPTACIÓN DEL BIEN.</Text>
        <Text style={s.para}>
          El BIEN ARRENDADO será entregado en{' '}
          {contract.lugarEntregaBien || direccionCliente || '[lugar de entrega]'}, contra
          firma del Acta de Entrega-Recepción. LA ARRENDATARIA reconoce haber inspeccionado
          el bien previo a la firma y declara recibirlo "AD-CORPUS" y a su entera
          satisfacción. A partir de la firma del Acta, LA ARRENDATARIA asume todos los
          riesgos inherentes al uso, custodia y conservación del BIEN ARRENDADO, liberando
          a LA ARRENDADORA de cualquier responsabilidad al respecto.
        </Text>

        <Text style={s.clauseTitle}>CUARTA. DESTINO DEL BIEN Y LUGAR DE USO.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a destinar el BIEN ARRENDADO única y exclusivamente para
          los fines lícitos para los que fue creado, conforme a su naturaleza y a las
          especificaciones del fabricante, sin darle un uso distinto al pactado.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a mantener el BIEN ARRENDADO dentro del territorio de los
          Estados Unidos Mexicanos. Queda estrictamente prohibido su traslado fuera del país
          sin la autorización previa y por escrito de LA ARRENDADORA. El incumplimiento de
          esta disposición constituirá causa de vencimiento anticipado del Contrato.
        </Text>

        <Text style={s.clauseTitle}>QUINTA. PLAZO DEL CONTRATO.</Text>
        <Text style={s.para}>
          El presente Contrato tendrá un Plazo Forzoso de {contract.plazo} ({plazoLetra})
          meses, a partir de la fecha de entrega del BIEN ARRENDADO, conforme al calendario
          de pagos establecido en la Carátula.
        </Text>
        <Text style={s.para}>
          LA ARRENDADORA notificará a LA ARRENDATARIA, con una anticipación mínima de 45
          (cuarenta y cinco) días naturales al vencimiento del Plazo Forzoso, sobre la
          conclusión del Contrato, a fin de que ésta exprese su intención de renovar el
          Contrato o de realizar la devolución del BIEN ARRENDADO conforme a lo establecido
          en la Cláusula Décima Segunda del presente instrumento.
        </Text>

        <Text style={s.clauseTitle}>SEXTA. PAGO DE RENTAS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a cubrir mensualmente a LA ARRENDADORA la Renta
          establecida en la Carátula, en la fecha de pago que ahí se señale. La obligación de
          pago es absoluta, incondicional y no sujeta a excepción alguna, independientemente
          del estado, funcionamiento o condición del BIEN ARRENDADO.
        </Text>
        <Text style={s.para}>
          El pago se realizará en el domicilio de LA ARRENDADORA ubicado en{' '}
          {direccionArrendadora}, mediante cheque certificado o de caja, o a través de
          transferencia electrónica o depósito a la cuenta de cheques con CLABE{' '}
          {b.banco.clabe || '[CLABE]'} de {b.banco.nombre || '[BANCO]'}, a nombre de{' '}
          {b.banco.beneficiario || b.empresa.razonSocial}.
        </Text>
        <Text style={s.para}>
          En caso de que la fecha de pago corresponda a un día inhábil, el pago deberá
          efectuarse el Día Hábil inmediato siguiente, sin que esto genere cargos moratorios.
          LA ARRENDADORA no podrá crear ni aumentar conceptos de pago ajenos a los
          establecidos en el presente Contrato y en su Carátula.
        </Text>

        <Text style={s.clauseTitle}>SÉPTIMA. FECHAS DE ACREDITAMIENTO DE PAGO.</Text>
        <Text style={s.para}>Efectivo: Se acreditará el mismo día de su recepción.</Text>
        <Text style={s.para}>Cheque del mismo banco: Se acreditará el mismo día.</Text>
        <Text style={s.para}>
          Cheque de otro banco: Depositado antes de las 16:00 horas, se acreditará a más
          tardar el Día Hábil bancario siguiente; después de las 16:00 horas, a más tardar
          el segundo Día Hábil bancario siguiente.
        </Text>
        <Text style={s.para}>
          Domiciliación: Se acreditará en la fecha que se acuerde con LA ARRENDADORA como
          fecha límite de pago.
        </Text>
        <Text style={s.para}>
          Transferencia electrónica (SPEI): Se acreditará el mismo Día Hábil en que se ordene
          la transferencia.
        </Text>

        <Text style={s.clauseTitle}>OCTAVA. INTERESES MORATORIOS.</Text>
        <Text style={s.para}>
          En caso de que LA ARRENDATARIA deje de pagar puntualmente cualquier Renta en los
          términos del presente Contrato, el monto no pagado, sea total o parcial, devengará
          intereses moratorios a partir del día siguiente a su vencimiento y hasta la total
          liquidación del adeudo.
        </Text>
        <Text style={s.para}>
          El interés moratorio se calculará aplicando al monto de las rentas vencidas no
          pagadas la tasa moratoria anual fija del {tasaMorPct}%, dividiéndose entre 360
          (trescientos sesenta) días, multiplicado por los días transcurridos en mora. A los
          importes resultantes se les adicionará el Impuesto al Valor Agregado que
          corresponda conforme a la Ley del IVA.
        </Text>
        <Text style={s.para}>
          Los intereses moratorios comenzarán a calcularse a partir del día hábil inmediato
          posterior a la fecha de pago señalada en la Carátula que no se encuentre cubierta
          de manera puntual y oportuna. LA ARRENDADORA no podrá modificar ni incrementar las
          tasas de interés de forma unilateral.
        </Text>

        <Text style={s.clauseTitle}>NOVENA. DEPÓSITO EN GARANTÍA.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA entregará a LA ARRENDADORA, como depósito en garantía, la cantidad
          señalada en la Carátula, como garantía del cumplimiento de todas las obligaciones
          a su cargo derivadas del presente Contrato.
        </Text>
        <Text style={s.para}>
          El depósito en garantía será retenido durante toda la vigencia del Contrato y no
          devengará intereses a favor de LA ARRENDATARIA. Al término del Plazo Forzoso,
          habiendo LA ARRENDATARIA cumplido con la totalidad de sus obligaciones y sin
          adeudos ni daños al BIEN ARRENDADO, el depósito le será devuelto contra la firma
          de la Carta de No Adeudo y el Acta de Devolución.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA autoriza expresamente a LA ARRENDADORA a aplicar el depósito al
          pago de cualquier saldo vencido, gastos de recuperación, reparaciones o daños
          derivados del incumplimiento de este Contrato. En tal caso, LA ARRENDATARIA se
          obliga a reconstituir el depósito al Día Hábil siguiente a la notificación
          correspondiente; la falta de reembolso generará Intereses Moratorios conforme a la
          Cláusula Octava.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA. MANTENIMIENTO Y CONSERVACIÓN DEL BIEN.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a mantener el BIEN ARRENDADO en óptimas condiciones de
          funcionamiento y conservación durante toda la vigencia del Contrato, realizando los
          mantenimientos preventivos y correctivos conforme a las especificaciones del
          fabricante o proveedor.
        </Text>
        <Text style={s.para}>
          Los mantenimientos deberán realizarse con personal calificado y con licencias o
          permisos requeridos para operar el bien. LA ARRENDATARIA deberá reportar cada
          servicio de mantenimiento a LA ARRENDADORA mediante comprobante (factura de taller,
          orden de servicio o reporte técnico).
        </Text>
        <Text style={s.para}>
          Queda estrictamente prohibido utilizar refacciones, partes o componentes no
          autorizados por el fabricante o proveedor sin el consentimiento previo y por
          escrito de LA ARRENDADORA. El incumplimiento de esta obligación constituirá causa
          de vencimiento anticipado del Contrato.
        </Text>
        <Text style={s.para}>
          Los gastos de mantenimiento, reparaciones y refacciones serán por cuenta exclusiva
          de LA ARRENDATARIA. LA ARRENDADORA no será responsable de las fallas, desperfectos
          o deficiencias del BIEN ARRENDADO, ni por la interrupción de las actividades de LA
          ARRENDATARIA derivadas de dichas situaciones.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA PRIMERA. SEGURO OBLIGATORIO.</Text>
        <Text style={s.para}>
          El BIEN ARRENDADO deberá estar amparado por una póliza de seguro contratada y
          gestionada por LA ARRENDADORA, cuyo costo será financiado dentro de la operación.
          La póliza deberá estar contratada y pagada antes de la entrega formal del BIEN
          ARRENDADO y deberá contar con endoso preferente e irrevocable a favor de LA
          ARRENDADORA.
        </Text>
        <Text style={s.para}>
          La cobertura mínima requerida variará según la categoría del activo: seguro amplio
          para vehículos; todo riesgo para maquinaria; equipo electrónico para equipo médico
          y tecnología; en todos los casos con los montos suficientes para cubrir el valor
          del BIEN ARRENDADO.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA deberá notificar de forma inmediata a LA ARRENDADORA y a la
          aseguradora cualquier siniestro que afecte al BIEN ARRENDADO. Cualquier
          indemnización derivada de la póliza de seguro se aplicará directamente a favor de
          LA ARRENDADORA, quien tendrá el derecho exclusivo de decidir su destino.
        </Text>
        <Text style={s.para}>
          La falta de seguro obligatorio o el no contratarlo dentro de los 3 (tres) días
          naturales siguientes a la firma del presente Contrato constituirán causa de
          vencimiento anticipado.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA SEGUNDA. SISTEMA DE RASTREO (GPS).</Text>
        <Text style={s.para}>
          En el caso de vehículos y activos de alta movilidad, es obligatorio contar con un
          sistema de rastreo GPS activo instalado en el BIEN ARRENDADO. El costo de
          adquisición, instalación y mantenimiento del dispositivo será a cargo de LA
          ARRENDATARIA. Los pagos y costos se realizarán conforme a lo dispuesto en la
          Carátula del presente contrato.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA TERCERA. LICENCIAS, PERMISOS Y REGISTROS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA se obliga a obtener, tramitar y mantener vigentes todas las
          licencias, permisos, concesiones, tenencias, registros y autorizaciones que
          requieran las leyes y reglamentos aplicables para la posesión, tenencia y uso del
          BIEN ARRENDADO. Serán por cuenta exclusiva de LA ARRENDATARIA el pago puntual de
          todos los impuestos, derechos, multas y erogaciones que por tales conceptos deban
          cubrirse a las autoridades correspondientes.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA CUARTA. OPCIONES AL TÉRMINO DEL CONTRATO.</Text>
        <Text style={s.para}>
          Al concluir el Plazo Forzoso y siempre que LA ARRENDATARIA haya cumplido con la
          totalidad de sus obligaciones, ésta deberá optar por una de las siguientes
          alternativas, notificando su elección a LA ARRENDADORA con una anticipación mínima
          de 30 (treinta) días naturales al vencimiento:
        </Text>
        <Text style={s.inciso}>
          I. Devolución del Bien Arrendado: LA ARRENDATARIA entregará el BIEN ARRENDADO a LA
          ARRENDADORA en el lugar que ésta designe, en las condiciones físicas y mecánicas
          pactadas, considerando únicamente el desgaste natural derivado de un uso normal y
          habiendo cumplido con los mantenimientos preventivos obligatorios. La devolución
          se formalizará mediante Acta de Entrega-Recepción. Una vez verificadas las
          condiciones del bien y la inexistencia de adeudos, LA ARRENDADORA devolverá el
          depósito en garantía y emitirá la Carta de No Adeudo.
        </Text>
        <Text style={s.inciso}>
          II. Renovación del Contrato: LA ARRENDATARIA podrá solicitar por escrito la
          renovación del presente Contrato, sujeto a evaluación del estado del BIEN
          ARRENDADO y del comportamiento de pago de LA ARRENDATARIA durante la vigencia. La
          renovación se formalizará mediante la firma de un convenio de renovación que
          establecerá los nuevos términos y condiciones comerciales aplicables.
        </Text>
        <Text style={s.para}>
          Si LA ARRENDATARIA no formaliza su decisión dentro de los 5 (cinco) días hábiles
          posteriores al vencimiento del Plazo Forzoso, se aplicarán las Rentas
          Extraordinarias conforme a la Cláusula Décima Quinta del presente instrumento.
        </Text>

        <Text style={s.clauseTitle}>
          DÉCIMA QUINTA. RENTAS EXTRAORDINARIAS POR NO DEVOLUCIÓN OPORTUNA.
        </Text>
        <Text style={s.para}>
          En caso de que LA ARRENDATARIA no devuelva el BIEN ARRENDADO ni formalice su
          decisión de renovación dentro de los 5 (cinco) días hábiles posteriores al
          vencimiento del Plazo Forzoso, se generarán automáticamente Rentas Extraordinarias
          a su cargo, equivalentes a la última Renta mensual pactada en la Carátula, por
          cada mes o fracción de mes en que el BIEN ARRENDADO permanezca en posesión de LA
          ARRENDATARIA sin autorización de LA ARRENDADORA.
        </Text>
        <Text style={s.para}>
          Las Rentas Extraordinarias no implican la renovación del Contrato ni otorgan
          derecho de uso sobre el BIEN ARRENDADO. LA ARRENDADORA se reserva el derecho de
          exigir la devolución inmediata del bien e iniciar las acciones legales
          correspondientes para su recuperación, sin perjuicio del cobro de las Rentas
          Extraordinarias generadas.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA SEXTA. OBLIGACIONES DE HACER.</Text>
        <Text style={s.para}>LA ARRENDATARIA se obliga a:</Text>
        <Text style={s.inciso}>
          • Proporcionar información financiera y operativa actualizada cuando le sea
          solicitada por LA ARRENDADORA.
        </Text>
        <Text style={s.inciso}>
          • Mantener el BIEN ARRENDADO en óptimas condiciones de conservación y operación.
        </Text>
        <Text style={s.inciso}>
          • Permitir inspecciones periódicas al BIEN ARRENDADO en cualquier momento que LA
          ARRENDADORA lo estime necesario.
        </Text>
        <Text style={s.inciso}>
          • Pagar todos los impuestos, derechos y multas asociados al uso y posesión del
          BIEN ARRENDADO.
        </Text>
        <Text style={s.inciso}>
          • Notificar por escrito cualquier cambio de domicilio con al menos 30 (treinta)
          días de anticipación.
        </Text>
        <Text style={s.inciso}>
          • Notificar de inmediato cualquier siniestro, embargo, decomiso o afectación que
          sufra el BIEN ARRENDADO.
        </Text>
        <Text style={s.inciso}>
          • Notificar a LA ARRENDADORA, dentro de los 15 (quince) días naturales siguientes,
          la existencia de cualquier acción, demanda o procedimiento en su contra que pueda
          afectar su situación financiera o la posesión del BIEN ARRENDADO.
        </Text>
        <Text style={s.inciso}>
          • Emplear exclusivamente refacciones originales y autorizadas por el fabricante en
          la reparación del BIEN ARRENDADO.
        </Text>
        <Text style={s.inciso}>
          • Reembolsar a LA ARRENDADORA todas aquellas cantidades que ésta pague por cuenta
          de LA ARRENDATARIA.
        </Text>
        <Text style={s.inciso}>
          • Cumplir con todas y cada una de las obligaciones establecidas en el presente
          Contrato y sus Anexos.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA SÉPTIMA. OBLIGACIONES DE NO HACER.</Text>
        <Text style={s.para}>LA ARRENDATARIA se obliga a no:</Text>
        <Text style={s.inciso}>
          • Destinar el BIEN ARRENDADO a fines ilícitos o distintos a los pactados
          contractualmente.
        </Text>
        <Text style={s.inciso}>
          • Ceder, subarrendar o transferir sus derechos u obligaciones derivados del
          presente Contrato sin el consentimiento previo y por escrito de LA ARRENDADORA.
        </Text>
        <Text style={s.inciso}>
          • Gravar, hipotecar o dar en garantía el BIEN ARRENDADO bajo ninguna figura
          jurídica.
        </Text>
        <Text style={s.inciso}>
          • Alterar las características esenciales o de identificación del BIEN ARRENDADO
          fuera de las reparaciones y mantenimientos necesarios en el uso ordinario del
          mismo.
        </Text>
        <Text style={s.inciso}>
          • Trasladar el BIEN ARRENDADO fuera de la República Mexicana sin autorización
          previa y por escrito de LA ARRENDADORA.
        </Text>
        {client.tipo === 'PM' && (
          <Text style={s.inciso}>
            • En caso de ser Persona Moral: fusionarse con otra sociedad, escindirse o
            efectuar cambios sustanciales en su estructura accionaria sin el consentimiento
            previo y por escrito de LA ARRENDADORA.
          </Text>
        )}

        <Text style={s.clauseTitle}>DÉCIMA OCTAVA. RIESGOS Y VICIOS OCULTOS.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA reconoce y acepta que, a partir de la firma del Acta de
          Entrega-Recepción, todos los riesgos por pérdida, daño o deterioro del BIEN
          ARRENDADO serán asumidos íntegramente por LA ARRENDATARIA. La ocurrencia de
          cualquier falla o siniestro en el BIEN ARRENDADO no liberará a LA ARRENDATARIA de
          su obligación de pagar puntualmente la totalidad de las Rentas pactadas.
        </Text>

        <Text style={s.clauseTitle}>DÉCIMA NOVENA. RESCISIÓN ANTICIPADA.</Text>
        <Text style={s.para}>
          LA ARRENDADORA, a su elección, podrá dar por vencido anticipadamente el presente
          CONTRATO y exigir el pago total de las Rentas pendientes y/o la devolución
          inmediata del BIEN ARRENDADO, en caso de que LA ARRENDATARIA incurra en cualquiera
          de los siguientes supuestos: falta de pago puntual de una o más Rentas; uso ilícito
          o distinto al pactado; deterioro grave por negligencia o mal uso; declaración en
          concurso mercantil, quiebra, disolución o liquidación; información falsa o errónea
          proporcionada durante el proceso de originación; embargo, decomiso o afectación
          del BIEN ARRENDADO por actos u omisiones de LA ARRENDATARIA; falta de contratación
          o vigencia de la póliza de seguro dentro de los 3 días siguientes a la firma;
          negativa a recibir el BIEN ARRENDADO sin causa justificada; uso de partes o
          refacciones no autorizadas sin consentimiento por escrito; incumplimiento en
          cualquier otro contrato celebrado con LA ARRENDADORA no subsanado en 5 días;
          impago sin causa justificada de adeudos fiscales o cuotas obrero-patronales;
          juicio laboral colectivo o solicitud de huelga; procedimiento de disolución o
          liquidación; negativa a permitir inspecciones físicas; traslado fuera de la
          República sin autorización previa y por escrito; en caso de Persona Moral, fusión
          o escisión sin consentimiento; y en general, cualquier incumplimiento de las
          obligaciones contraídas en el presente instrumento.
        </Text>
        <Text style={s.para}>
          El supuesto de que se actualizase alguna de las causales anteriores, LA ARRENDADORA
          podrá de manera discrecional dar por terminado el presente contrato. El no
          ejercicio de dicha terminación anticipada no implica renuncia al derecho.
        </Text>

        <Text style={s.clauseTitle}>
          VIGÉSIMA. TERMINACIÓN ANTICIPADA A SOLICITUD DE LA ARRENDATARIA.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA podrá solicitar la terminación anticipada del presente Contrato,
          siempre que cubra en una sola exhibición la totalidad de las Rentas periódicas
          pactadas que estén pendientes de vencimiento a la fecha de la solicitud, así como
          cualquier adeudo vencido, Intereses Moratorios y gastos generados. La terminación
          anticipada no incluye el depósito en garantía, el cual se devolverá conforme a las
          condiciones de la Cláusula Novena.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA contará con un plazo de 10 (diez) días hábiles posteriores a la
          firma del presente instrumento para cancelarlo sin responsabilidad alguna,
          siempre que no haya recibido el BIEN ARRENDADO y lo mantenga, en su caso, en el
          estado en que fue entregado.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA PRIMERA. CASO FORTUITO Y FUERZA MAYOR.</Text>
        <Text style={s.para}>
          LA ARRENDATARIA reconoce y acepta que la pérdida parcial o total del BIEN
          ARRENDADO, aun cuando se origine por caso fortuito o fuerza mayor, no la libera de
          la obligación de cubrir íntegramente las Rentas pactadas y demás obligaciones
          derivadas del presente Contrato. En consecuencia, LA ARRENDATARIA continuará
          obligada a pagar puntualmente las Rentas y demás cantidades a su cargo en los
          términos convenidos, sin que pueda invocar dichas eventualidades como causa de
          suspensión, modificación o terminación de sus obligaciones de pago.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA SEGUNDA. INSPECCIÓN DEL BIEN.</Text>
        <Text style={s.para}>
          LA ARRENDADORA tendrá derecho a inspeccionar el BIEN ARRENDADO en cualquier
          momento durante horas hábiles, para verificar su estado, ubicación y uso. LA
          ARRENDATARIA se obliga a otorgar todas las facilidades necesarias para tales
          inspecciones y a no obstaculizarlas en ningún caso.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA TERCERA. DEUDOR SOLIDARIO Y/O AVALISTA.</Text>
        <Text style={s.para}>
          Para garantizar el cumplimiento total, puntual y cabal de todas las obligaciones a
          cargo de LA ARRENDATARIA, comparece y se obliga EL DEUDOR SOLIDARIO Y/O AVALISTA,
          quien por virtud de este acto se constituye como obligado principal, deudor directo
          y garante de la totalidad de las obligaciones de pago y de cualquier otra índole
          contenidas en el presente Contrato.
        </Text>
        <Text style={s.para}>
          En consecuencia, renuncia de forma expresa e irrevocable a los beneficios de orden,
          excusión y división, de conformidad con los artículos 1988, 2814 y 2815 del Código
          Civil Federal. Por lo tanto, LA ARRENDADORA podrá exigir el pago total directamente
          en su contra, sin necesidad de demandar o ejecutar previamente a LA ARRENDATARIA.
          Adicionalmente, EL DEUDOR SOLIDARIO Y/O AVALISTA se obliga a no enajenar, gravar o
          de cualquier forma limitar el dominio de sus bienes sin el consentimiento previo y
          por escrito de LA ARRENDADORA, mientras exista cualquier saldo insoluto o adeudo
          derivado del presente Contrato.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA CUARTA. REPOSICIÓN Y PÉRDIDA TOTAL.</Text>
        <Text style={s.para}>
          En caso de pérdida total, destrucción o siniestro del BIEN ARRENDADO, aun por caso
          fortuito o fuerza mayor, LA ARRENDATARIA no quedará liberada de sus obligaciones
          de pago ni se suspenderán las Rentas pactadas. Cualquier indemnización derivada de
          la póliza de seguro se aplicará directamente a favor de LA ARRENDADORA, quien
          decidirá su destino: liquidación del saldo adeudado o adquisición de un bien de
          similares características que sustituya al BIEN ARRENDADO, manteniéndose en este
          último caso las obligaciones del presente Contrato.
        </Text>
        <Text style={s.para}>
          En caso de que la indemnización no cubra en su totalidad el valor del BIEN
          ARRENDADO, LA ARRENDATARIA deberá cubrir la diferencia dentro de los 30 (treinta)
          días naturales siguientes a la notificación de LA ARRENDADORA. El incumplimiento de
          esta obligación constituirá causa de vencimiento anticipado del Contrato.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA QUINTA. ESTADOS DE CUENTA.</Text>
        <Text style={s.para}>
          LA ARRENDADORA emitirá estados de cuenta trimestrales de manera gratuita,
          enviándolos al domicilio o medio señalado en la Carátula. Los estados de cuenta
          harán prueba plena en juicio, salvo objeción por escrito presentada por LA
          ARRENDATARIA dentro de los 10 (diez) días naturales siguientes a su recepción. LA
          ARRENDATARIA podrá solicitar copia del mismo en cualquier sucursal u oficina de LA
          ARRENDADORA.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA SEXTA. EJECUTIVIDAD DEL CONTRATO.</Text>
        <Text style={s.para}>
          Las partes convienen que el presente Contrato, junto con el estado de cuenta
          certificado por el contador de LA ARRENDADORA, hará prueba plena sobre la relación
          jurídica y el saldo adeudado, pudiendo LA ARRENDADORA iniciar la acción ejecutiva
          correspondiente con base en dichos documentos.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA SÉPTIMA. CESIÓN DE DERECHOS.</Text>
        <Text style={s.para}>
          LA ARRENDADORA podrá ceder los derechos derivados de este Contrato sin necesidad
          de autorización de LA ARRENDATARIA. LA ARRENDATARIA no podrá ceder sus derechos ni
          obligaciones sin el consentimiento previo y por escrito de LA ARRENDADORA.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA OCTAVA. IMPUESTOS.</Text>
        <Text style={s.para}>
          Todos los impuestos, derechos y contribuciones, presentes o futuros, que se
          deriven del presente Contrato, serán a cargo de las Partes respectivamente de sus
          obligaciones y en términos de la legislación fiscal vigente.
        </Text>

        <Text style={s.clauseTitle}>VIGÉSIMA NOVENA. MODIFICACIONES AL CONTRATO.</Text>
        <Text style={s.para}>
          Toda modificación al presente Contrato deberá formalizarse mediante convenio por
          escrito, firmado por ambas Partes. Las tasas de interés pactadas no podrán ser
          modificadas unilateralmente por LA ARRENDADORA, salvo reestructuración con
          consentimiento expreso y por escrito de LA ARRENDATARIA.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA. NOTIFICACIONES.</Text>
        <Text style={s.para}>
          Para todos los efectos legales del presente Contrato, toda notificación será
          válida cuando sea entregada por entrega personal con acuse de recibo en los
          domicilios físicos señalados o por correo electrónico a las direcciones
          designadas en este Contrato.
        </Text>
        <Text style={s.para}>
          LA ARRENDATARIA: {direccionCliente}, correo electrónico:{' '}
          {client.email || '__________'}.
        </Text>
        <Text style={s.para}>
          LA ARRENDADORA: {direccionArrendadora}, correo electrónico: {b.contacto.email}.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA PRIMERA. ATENCIÓN A USUARIOS Y RECLAMACIONES.</Text>
        <Text style={s.para}>
          En cumplimiento con la Ley de Protección y Defensa al Usuario de Servicios
          Financieros, LA ARRENDADORA cuenta con una Unidad Especializada de Atención a
          Usuarios (UNE) para atender consultas, reclamaciones y aclaraciones de LA
          ARRENDATARIA: Titular Diana Arteaga López, domicilio en {direccionArrendadora},
          teléfonos {b.contacto.telefonos}, correo {b.contacto.email}, horario lunes a
          viernes 09:00 a 18:00. En caso de no obtener respuesta satisfactoria, LA
          ARRENDATARIA podrá acudir a CONDUSEF: www.condusef.gob.mx | 55 5340 0999 y 800 999
          8080 | asesoria@condusef.gob.mx.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA SEGUNDA. PROTECCIÓN DE DATOS PERSONALES.</Text>
        <Text style={s.para}>
          LA ARRENDADORA tratará los datos personales de LA ARRENDATARIA conforme a la Ley
          Federal de Protección de Datos Personales en Posesión de los Particulares y su
          Reglamento, así como al Aviso de Privacidad que forma parte del presente Contrato
          como Anexo.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA TERCERA. JURISDICCIÓN Y LEYES APLICABLES.</Text>
        <Text style={s.para}>
          Para la interpretación y cumplimiento del presente Contrato, las Partes se someten
          a las leyes aplicables y a la jurisdicción de los tribunales competentes de la
          ciudad de San Luis Potosí, S.L.P., renunciando expresamente a cualquier otro fuero
          que por razón de sus domicilios presentes o futuros pudiera corresponderles.
        </Text>

        <Text style={s.clauseTitle}>TRIGÉSIMA CUARTA. ANEXOS.</Text>
        <Text style={s.para}>
          Forman parte integrante del presente Contrato los siguientes documentos:
          a) Carátula del Contrato; b) Acta de Entrega-Recepción del Bien;
          c) Copia de la póliza de seguro;
          d) Autorización de consulta de buró de crédito e historial crediticio;
          e) Anexo de Disposiciones Legales Aplicables; f) Aviso de Privacidad.
        </Text>

        {/* ── Firmas ─────────────────────────────────────────── */}
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
