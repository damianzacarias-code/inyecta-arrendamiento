/**
 * Abstracción del proveedor de timbrado CFDI 4.0.
 *
 * Implementa el contrato `ICfdiProvider` para enchufar Facturama, SW Sapien,
 * Edicom u otros PACs sin tocar las rutas. La fábrica `getCfdiProvider()` lee
 * `process.env.CFDI_PROVIDER` (MOCK | FACTURAMA | SW) y devuelve la
 * implementación adecuada. Por defecto MOCK para no requerir credenciales.
 *
 * Variables de entorno relevantes:
 *   CFDI_PROVIDER          MOCK (default) | FACTURAMA | SW
 *   CFDI_EMISOR_RFC        RFC del emisor (default: FSC123456ABC para MOCK)
 *   CFDI_EMISOR_NOMBRE     Razón social del emisor
 *   CFDI_EMISOR_REGIMEN    Régimen fiscal del emisor (default: 601)
 *   CFDI_LUGAR_EXPEDICION  CP del lugar de expedición (default: 78215, SLP)
 *   FACTURAMA_USER         Usuario API Facturama (Basic auth)
 *   FACTURAMA_PASS         Password API Facturama
 *   FACTURAMA_SANDBOX      "true" → apisandbox.facturama.mx, false → api
 */

import crypto from 'crypto';
import { config } from '../config/env';

export interface CfdiInvoiceInput {
  serie: string;
  folio: number;
  tipo: 'INGRESO' | 'EGRESO' | 'PAGO';
  receptor: {
    rfc: string;
    nombre: string;
    usoCfdi: string;
    regimenFiscal: string;
  };
  conceptos: Array<{
    descripcion: string;
    cantidad: number;
    valorUnitario: number;
    importe: number;
    claveProdServ?: string;
    claveUnidad?: string;
  }>;
  subtotal: number;
  iva: number;
  retenciones: number;
  total: number;
  metodoPago: string;
  formaPago: string;
  /**
   * Sólo para tipo='PAGO'. Pagos relacionados que se reportan en el
   * Complemento de Pago 2.0. Ver SAT — Anexo 20 §III.G.
   */
  complementoPago?: {
    fechaPago: Date;
    formaPago: string;            // 03 transferencia, 04 tarjeta, etc.
    monto: number;
    moneda?: string;              // default MXN
    documentosRelacionados: Array<{
      uuidFactura:  string;       // UUID del CFDI de ingreso original
      serie?:       string;
      folio?:       string;
      moneda?:      string;
      numParcialidad: number;     // 1, 2, 3...
      saldoAnterior:  number;
      importePagado:  number;
      saldoInsoluto:  number;
    }>;
  };
}

export interface CfdiTimbradoResult {
  uuid: string;
  fechaTimbrado: Date;
  xmlBase64: string;     // El XML timbrado completo
  selloSat?: string;
  noCertSat?: string;
}

export interface CfdiCancelacionResult {
  ok: boolean;
  acuse?: string;
  fechaCancelacion: Date;
}

export interface ICfdiProvider {
  readonly name: string;
  timbrar(input: CfdiInvoiceInput): Promise<CfdiTimbradoResult>;
  cancelar(uuid: string, motivo: string): Promise<CfdiCancelacionResult>;
}

// Datos del emisor (configurables vía config/env tipado).
// Si CFDI_EMISOR_NOMBRE no está configurado, cae al BRAND_RAZON_SOCIAL
// (en MAYÚSCULAS, como exige el SAT en el atributo Nombre del Emisor).
function emisor() {
  const e = config.cfdi.emisor;
  const fallbackNombre = config.branding.empresa.razonSocial.toUpperCase();
  return {
    rfc:     e.rfc             || 'FSC123456ABC',
    nombre:  e.nombre          || fallbackNombre,
    regimen: e.regimen         || '601',
    cp:      e.lugarExpedicion || '78215', // SLP, sede Inyecta
  };
}

// Escape XML mínimo para atributos. NO sustituye un signer real.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Implementación MOCK (sin red, sin credenciales) ────────
class MockCfdiProvider implements ICfdiProvider {
  readonly name = 'MOCK';

  async timbrar(input: CfdiInvoiceInput): Promise<CfdiTimbradoResult> {
    const uuid = crypto.randomUUID().toUpperCase();
    const fechaTimbrado = new Date();
    const fechaIso = fechaTimbrado.toISOString().slice(0, 19);
    const e = emisor();
    const tipoComp = input.tipo === 'INGRESO' ? 'I' : input.tipo === 'EGRESO' ? 'E' : 'P';

    // Conceptos
    const conceptosXml = input.conceptos.map(c =>
      `    <cfdi:Concepto ClaveProdServ="${xmlEscape(c.claveProdServ || '78111800')}" Cantidad="${c.cantidad}" ClaveUnidad="${xmlEscape(c.claveUnidad || 'E48')}" Descripcion="${xmlEscape(c.descripcion)}" ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${c.importe.toFixed(2)}" ObjetoImp="02"/>`
    ).join('\n');

    // Complemento de Pago 2.0 (SAT — Anexo 20 §III.G).
    // Sólo se incluye cuando tipo='PAGO' Y se proporcionó complementoPago.
    let complementoPagoXml = '';
    if (input.tipo === 'PAGO' && input.complementoPago) {
      const cp = input.complementoPago;
      const fechaPagoIso = cp.fechaPago.toISOString().slice(0, 19);
      const moneda = cp.moneda || 'MXN';
      const docsRelacionados = cp.documentosRelacionados.map(d =>
        `        <pago20:DoctoRelacionado IdDocumento="${xmlEscape(d.uuidFactura)}"${
          d.serie ? ` Serie="${xmlEscape(d.serie)}"` : ''
        }${
          d.folio ? ` Folio="${xmlEscape(d.folio)}"` : ''
        } MonedaDR="${d.moneda || 'MXN'}" EquivalenciaDR="1" NumParcialidad="${d.numParcialidad}" ImpSaldoAnt="${d.saldoAnterior.toFixed(2)}" ImpPagado="${d.importePagado.toFixed(2)}" ImpSaldoInsoluto="${d.saldoInsoluto.toFixed(2)}" ObjetoImpDR="02"/>`
      ).join('\n');
      complementoPagoXml = `
    <pago20:Pagos Version="2.0" xmlns:pago20="http://www.sat.gob.mx/Pagos20">
      <pago20:Totales MontoTotalPagos="${cp.monto.toFixed(2)}"/>
      <pago20:Pago FechaPago="${fechaPagoIso}" FormaDePagoP="${xmlEscape(cp.formaPago)}" MonedaP="${moneda}" TipoCambioP="1" Monto="${cp.monto.toFixed(2)}">
${docsRelacionados}
      </pago20:Pago>
    </pago20:Pagos>`;
    }

    const tfdXml = `    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaIso}" RfcProvCertif="MOCK010101AAA" SelloSAT="MOCK_SELLO" NoCertificadoSAT="MOCK_CERT" SelloCFD="MOCK_SELLO_CFD"/>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"
  Serie="${xmlEscape(input.serie)}"
  Folio="${input.folio}"
  Fecha="${fechaIso}"
  SubTotal="${input.subtotal.toFixed(2)}"
  Total="${input.total.toFixed(2)}"
  Moneda="MXN"
  TipoDeComprobante="${tipoComp}"
  MetodoPago="${xmlEscape(input.metodoPago)}"
  FormaPago="${xmlEscape(input.formaPago)}"
  Exportacion="01"
  LugarExpedicion="${xmlEscape(e.cp)}">
  <cfdi:Emisor Rfc="${xmlEscape(e.rfc)}" Nombre="${xmlEscape(e.nombre)}" RegimenFiscal="${xmlEscape(e.regimen)}"/>
  <cfdi:Receptor Rfc="${xmlEscape(input.receptor.rfc)}" Nombre="${xmlEscape(input.receptor.nombre)}" DomicilioFiscalReceptor="${xmlEscape(e.cp)}" UsoCFDI="${xmlEscape(input.receptor.usoCfdi)}" RegimenFiscalReceptor="${xmlEscape(input.receptor.regimenFiscal)}"/>
  <cfdi:Conceptos>
${conceptosXml}
  </cfdi:Conceptos>
  <cfdi:Complemento>${complementoPagoXml}
${tfdXml}
  </cfdi:Complemento>
</cfdi:Comprobante>`;

    return {
      uuid,
      fechaTimbrado,
      xmlBase64: Buffer.from(xml).toString('base64'),
      selloSat: 'MOCK_SELLO_' + uuid.slice(0, 8),
      noCertSat: 'MOCK_CERT',
    };
  }

  async cancelar(_uuid: string, _motivo: string): Promise<CfdiCancelacionResult> {
    return {
      ok: true,
      acuse: 'MOCK_ACUSE_' + Date.now(),
      fechaCancelacion: new Date(),
    };
  }
}

// ─── Implementación real: Facturama (REST + Basic auth) ─────
//
// Documentación oficial: https://apisandbox.facturama.mx/swagger/ui/index
// Endpoints clave usados:
//   POST   /api-lite/2/cfdis      Creación + timbrado de CFDI 4.0 ("Issue").
//                                 Devuelve { Id, Complemento.TimbreFiscalDigital.UUID, ... }
//   GET    /cfdi/xml/issued/{id}  Descarga XML timbrado (string base64).
//   DELETE /cfdi/{id}             Cancela el CFDI (motivo y folioSustitucion en query).
//
// Autenticación: Basic con FACTURAMA_USER:FACTURAMA_PASS.
// Sandbox: usa apisandbox.facturama.mx; producción api.facturama.mx.
class FacturamaProvider implements ICfdiProvider {
  readonly name = 'FACTURAMA';
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor() {
    const { user, pass, sandbox } = config.cfdi.facturama;
    // env.ts ya valida que si CFDI_PROVIDER=FACTURAMA, user/pass existen.
    // Este check es defensa en profundidad por si alguien instancia FacturamaProvider
    // directamente sin pasar por getCfdiProvider().
    if (!user || !pass) {
      throw new Error(
        'Provider FACTURAMA requiere FACTURAMA_USER y FACTURAMA_PASS en el entorno.',
      );
    }
    this.baseUrl = sandbox
      ? 'https://apisandbox.facturama.mx'
      : 'https://api.facturama.mx';
    this.authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  /** Mapea nuestro CfdiInvoiceInput al body que espera Facturama. */
  private mapBody(input: CfdiInvoiceInput): Record<string, unknown> {
    const e = emisor();
    const tipoComp = input.tipo === 'INGRESO' ? 'I' : input.tipo === 'EGRESO' ? 'E' : 'P';

    const items = input.conceptos.map((c) => ({
      ProductCode:    c.claveProdServ || '78111800',
      Quantity:       c.cantidad,
      UnitCode:       c.claveUnidad || 'E48',
      Unit:           'Servicio',
      Description:    c.descripcion,
      UnitPrice:      c.valorUnitario,
      Subtotal:       c.importe,
      TaxObject:      '02',
      Total:          +(c.importe * 1.16).toFixed(2),
      Taxes: [
        {
          Total: +(c.importe * 0.16).toFixed(2),
          Name:  'IVA',
          Base:  c.importe,
          Rate:  0.16,
          IsRetention: false,
        },
      ],
    }));

    const body: Record<string, unknown> = {
      NameId:        '1',                   // 1 = Factura
      Folio:         String(input.folio),
      Serie:         input.serie,
      CfdiType:      tipoComp,              // I, E, P
      PaymentForm:   input.formaPago,
      PaymentMethod: input.metodoPago,
      Currency:      'MXN',
      ExpeditionPlace: e.cp,
      Exportation:   '01',
      Issuer: {
        Rfc:           e.rfc,
        Name:          e.nombre,
        FiscalRegime:  e.regimen,
      },
      Receiver: {
        Rfc:                  input.receptor.rfc,
        Name:                 input.receptor.nombre,
        FiscalRegime:         input.receptor.regimenFiscal,
        TaxZipCode:           e.cp,
        CfdiUse:              input.receptor.usoCfdi,
      },
      Items: items,
    };

    // Complemento de Pago (Pago 2.0) si aplica
    if (input.tipo === 'PAGO' && input.complementoPago) {
      const cp = input.complementoPago;
      body.Complemento = {
        Payments: [
          {
            Date:        cp.fechaPago.toISOString().slice(0, 19),
            PaymentForm: cp.formaPago,
            Currency:    cp.moneda || 'MXN',
            Amount:      cp.monto,
            RelatedDocuments: cp.documentosRelacionados.map((d) => ({
              Uuid:               d.uuidFactura,
              Serie:              d.serie,
              Folio:              d.folio,
              Currency:           d.moneda || 'MXN',
              PaymentMethod:      'PPD',
              PartialityNumber:   d.numParcialidad,
              PreviousBalanceAmount: d.saldoAnterior,
              AmountPaid:            d.importePagado,
              ImpSaldoInsoluto:      d.saldoInsoluto,
              TaxObject:             '02',
            })),
          },
        ],
      };
    }
    return body;
  }

  async timbrar(input: CfdiInvoiceInput): Promise<CfdiTimbradoResult> {
    const body = this.mapBody(input);
    const resp = await fetch(`${this.baseUrl}/api-lite/2/cfdis`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Facturama timbrado falló (${resp.status}): ${txt.slice(0, 500)}`);
    }
    const json: any = await resp.json();
    const id = json.Id as string | undefined;
    const uuid = (json.Complemento?.TimbreFiscalDigital?.UUID
                  || json.UUID
                  || json.Uuid) as string | undefined;
    const fechaTimbradoStr = json.Complemento?.TimbreFiscalDigital?.FechaTimbrado
                             || json.FechaTimbrado;
    if (!id || !uuid) {
      throw new Error(
        `Facturama devolvió respuesta sin Id/UUID: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }

    // Descargar el XML timbrado
    const xmlResp = await fetch(`${this.baseUrl}/cfdi/xml/issued/${encodeURIComponent(id)}`, {
      headers: { 'Authorization': this.authHeader },
    });
    if (!xmlResp.ok) {
      throw new Error(`Facturama no devolvió XML (${xmlResp.status})`);
    }
    const xmlBase64 = Buffer.from(await xmlResp.arrayBuffer()).toString('base64');

    return {
      uuid,
      fechaTimbrado: fechaTimbradoStr ? new Date(fechaTimbradoStr) : new Date(),
      xmlBase64,
      selloSat:  json.Complemento?.TimbreFiscalDigital?.SelloSAT,
      noCertSat: json.Complemento?.TimbreFiscalDigital?.NoCertificadoSAT,
    };
  }

  async cancelar(uuid: string, motivo: string): Promise<CfdiCancelacionResult> {
    // Facturama acepta cancelación por UUID via DELETE /cfdi/{id}?type=issued&motive=02
    // Motivos SAT: 01 errores con relación, 02 errores sin relación, 03 no se llevó a cabo, 04 nominativa.
    const motiveCode = /^\d{2}$/.test(motivo) ? motivo : '02';
    const url = `${this.baseUrl}/cfdi?uuid=${encodeURIComponent(uuid)}&type=issued&motive=${motiveCode}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': this.authHeader },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return {
        ok: false,
        acuse: `Facturama cancelación falló (${resp.status}): ${txt.slice(0, 300)}`,
        fechaCancelacion: new Date(),
      };
    }
    const json: any = await resp.json().catch(() => ({}));
    return {
      ok: true,
      acuse: json.Acuse || json.AcuseSAT || `Cancelado: ${uuid}`,
      fechaCancelacion: new Date(),
    };
  }
}

class SwSapienProvider implements ICfdiProvider {
  readonly name = 'SW';
  async timbrar(_input: CfdiInvoiceInput): Promise<CfdiTimbradoResult> {
    throw new Error('Provider SW no configurado. Falta integrar con su API.');
  }
  async cancelar(_uuid: string, _motivo: string): Promise<CfdiCancelacionResult> {
    throw new Error('Provider SW no configurado.');
  }
}

let _instance: ICfdiProvider | null = null;

export function getCfdiProvider(): ICfdiProvider {
  if (_instance) return _instance;
  switch (config.cfdi.provider) {
    case 'FACTURAMA': _instance = new FacturamaProvider(); break;
    case 'SW': _instance = new SwSapienProvider(); break;
    case 'MOCK':
    default: _instance = new MockCfdiProvider(); break;
  }
  return _instance;
}
