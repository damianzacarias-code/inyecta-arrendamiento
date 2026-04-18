/**
 * Abstracción del proveedor de timbrado CFDI 4.0.
 *
 * Implementa el contrato `ICfdiProvider` para enchufar Facturama, SW Sapien,
 * Edicom u otros PACs sin tocar las rutas. La fábrica `getCfdiProvider()` lee
 * `process.env.CFDI_PROVIDER` (MOCK | FACTURAMA | SW) y devuelve la
 * implementación adecuada. Por defecto MOCK para no requerir credenciales.
 */

import crypto from 'crypto';

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

// ─── Implementación MOCK (sin red, sin credenciales) ────────
class MockCfdiProvider implements ICfdiProvider {
  readonly name = 'MOCK';

  async timbrar(input: CfdiInvoiceInput): Promise<CfdiTimbradoResult> {
    // UUID v4-ish determinístico-aleatorio
    const uuid = crypto.randomUUID().toUpperCase();
    const fechaTimbrado = new Date();

    // XML simulado (estructura mínima CFDI 4.0)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  Serie="${input.serie}"
  Folio="${input.folio}"
  Fecha="${fechaTimbrado.toISOString().slice(0, 19)}"
  SubTotal="${input.subtotal.toFixed(2)}"
  Total="${input.total.toFixed(2)}"
  Moneda="MXN"
  TipoDeComprobante="${input.tipo === 'INGRESO' ? 'I' : input.tipo === 'EGRESO' ? 'E' : 'P'}"
  MetodoPago="${input.metodoPago}"
  FormaPago="${input.formaPago}"
  LugarExpedicion="01000">
  <cfdi:Emisor Rfc="FSC123456ABC" Nombre="FSMP SOLUCIONES DE CAPITAL SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${input.receptor.rfc}" Nombre="${input.receptor.nombre}" UsoCFDI="${input.receptor.usoCfdi}" RegimenFiscalReceptor="${input.receptor.regimenFiscal}"/>
  <cfdi:Conceptos>
${input.conceptos.map(c => `    <cfdi:Concepto ClaveProdServ="${c.claveProdServ || '78111800'}" Cantidad="${c.cantidad}" ClaveUnidad="${c.claveUnidad || 'E48'}" Descripcion="${c.descripcion}" ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${c.importe.toFixed(2)}"/>`).join('\n')}
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${fechaTimbrado.toISOString().slice(0,19)}" RfcProvCertif="MOCK010101AAA" SelloSAT="MOCK_SELLO" NoCertificadoSAT="MOCK_CERT"/>
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

// Stubs para futuros providers (lanzan error explícito hasta implementarse)
class FacturamaProvider implements ICfdiProvider {
  readonly name = 'FACTURAMA';
  async timbrar(_input: CfdiInvoiceInput): Promise<CfdiTimbradoResult> {
    throw new Error('Provider FACTURAMA no configurado. Falta integrar con su API REST.');
  }
  async cancelar(_uuid: string, _motivo: string): Promise<CfdiCancelacionResult> {
    throw new Error('Provider FACTURAMA no configurado.');
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
  const provider = (process.env.CFDI_PROVIDER || 'MOCK').toUpperCase();
  switch (provider) {
    case 'FACTURAMA': _instance = new FacturamaProvider(); break;
    case 'SW': _instance = new SwSapienProvider(); break;
    default: _instance = new MockCfdiProvider(); break;
  }
  return _instance;
}
