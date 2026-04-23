/**
 * MockProvider.ts — Provider determinista para desarrollo y tests.
 *
 * Devuelve datos hardcoded por tipo, sin llamar a la red. Útil para:
 *   - Tests unitarios del endpoint /api/extract.
 *   - Demos sin gastar créditos de la API.
 *   - Debugging del frontend cuando no hay ANTHROPIC_API_KEY.
 *
 * Confidence siempre es 0.6 — suficientemente bajo para que el
 * frontend muestre el warning "Verifica los campos extraídos" y deje
 * claro al usuario que NO es producción real.
 */
import type { IExtractProvider, ExtractResult, TipoExtract } from './types';

const MOCK_DATA: Record<TipoExtract, Record<string, unknown>> = {
  CSF: {
    rfc: 'XAXX010101000',
    razonSocial: 'Constructora Demo del Bajío SA de CV',
    curp: null,
    regimenFiscal: '601 - General de Ley Personas Morales',
    codigoPostal: '37000',
    domicilioFiscal: 'Av. Universidad 100, León, Guanajuato',
    fechaInicioOperaciones: '2018-03-15',
    estatusPadron: 'ACTIVO',
  },
  INE: {
    nombre: 'JUAN',
    apellidoPaterno: 'PÉREZ',
    apellidoMaterno: 'GARCÍA',
    curp: 'PEGJ800101HDFRRN02',
    claveElector: 'PRGRJN80010109H400',
    fechaNacimiento: '1980-01-01',
    vigencia: '2030',
    domicilio: 'Av. Reforma 100 Col. Centro CDMX 06000',
    sexo: 'H',
  },
  COMPROBANTE_DOMICILIO: {
    emisor: 'CFE',
    titular: 'Juan Pérez García',
    direccion: 'Av. Reforma 100 Col. Centro, Cuauhtémoc, CDMX, CP 06000',
    codigoPostal: '06000',
    fechaEmision: '2026-03-15',
    periodo: 'Febrero 2026',
  },
  FACTURA_BIEN: {
    proveedor: 'Distribuidora Toyota Monterrey SA de CV',
    rfcProveedor: 'DTM050101AB1',
    bienDescripcion: 'Camioneta pickup Toyota Hilux SR doble cabina 4x4',
    bienMarca: 'Toyota',
    bienModelo: 'Hilux SR',
    bienAnio: 2024,
    bienNumSerie: 'MR0FB22G500MOCK01',
    valorBienSinIVA: 1810344.83,
    ivaTrasladado: 289655.17,
    valorBienConIVA: 2100000.00,
    fechaFactura: '2026-04-15',
    folio: 'A-12345',
  },
  ACTA_CONSTITUTIVA: {
    razonSocial: 'Constructora Demo del Bajío SA de CV',
    fechaConstitucion: '2018-03-15',
    numeroEscritura: '12345',
    notario: 'Lic. Carlos Méndez Rivera',
    numeroNotaria: '7',
    ciudadNotaria: 'León, Guanajuato',
    capitalSocial: 500000,
    duracion: '99 años',
    objetoSocial: 'Construcción de obra civil, residencial e industrial',
    representanteLegal: 'Roberto Hernández Salinas',
  },
};

export class MockProvider implements IExtractProvider {
  readonly name = 'MOCK' as const;

  async extract(_file: Buffer, _mimeType: string, tipo: TipoExtract): Promise<ExtractResult> {
    const data = MOCK_DATA[tipo];
    if (!data) {
      return {
        ok: false,
        data: {},
        confidence: 0,
        provider: 'MOCK',
        error: `Tipo no soportado por el mock provider: ${tipo}`,
      };
    }
    return {
      ok: true,
      data: { ...data },        // copia para evitar mutaciones accidentales
      confidence: 0.6,           // bajo a propósito → frontend mostrará warning
      provider: 'MOCK',
    };
  }
}
