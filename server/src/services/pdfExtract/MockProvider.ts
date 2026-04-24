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
  // SOLICITUD — datos anonimizados de muestra (PFAE). El MockProvider
  // SIEMPRE devuelve este ejemplo; el real dispatch por tipo
  // PFAE/PM sucede cuando el provider es CLAUDE con el PDF real.
  // Sirve para probar la UI sin gastar créditos de API.
  SOLICITUD: {
    tipoSolicitante: 'PFAE',
    operacion: {
      tipoArrendamiento: 'FINANCIERO',
      plazoMeses: 48,
      moneda: 'MXN',
      destino: 'Transporte de materiales para obra de construcción',
    },
    bien: {
      descripcion: 'Camioneta pickup doble cabina 4x4',
      marca: 'Toyota',
      modelo: 'Hilux SR',
      anio: 2024,
      numSerie: 'MR0FB22G500DEMO01',
      color: 'Blanco',
      valorConIVA: 2100000,
      nuevo: true,
      proveedor: 'Distribuidora Toyota Monterrey SA de CV',
      rfcProveedor: 'DTM050101AB1',
    },
    solicitantePFAE: {
      nombre: 'DEMO JUAN',
      apellidoPaterno: 'PÉREZ',
      apellidoMaterno: 'GARCÍA',
      rfc: 'PEGJ800101AB1',
      curp: 'PEGJ800101HDFRRN02',
      fechaNacimiento: '1980-01-01',
      lugarNacimiento: 'Ciudad de México',
      nacionalidad: 'Mexicana',
      sexo: 'H',
      estadoCivil: 'Casado',
      regimenMatrimonial: 'Separación de bienes',
      email: 'juan.demo@example.com',
      telefono: '5512345678',
      celular: '5591234567',
      actividad: 'Construcción de obra civil',
      giro: 'Construcción',
      antiguedadNegocio: '8 años',
      ingresoMensual: 180000,
      calle: 'Av. Reforma',
      numExterior: '100',
      numInterior: 'A',
      colonia: 'Centro',
      municipio: 'Cuauhtémoc',
      ciudad: 'Ciudad de México',
      estado: 'CDMX',
      codigoPostal: '06000',
      pais: 'México',
      tipoInmueble: 'Propio',
      antiguedadDomicilio: '5 años',
    },
    solicitantePM: null,
    representanteLegal: null,
    conyuge: null,
    perfilTransaccional: {
      montoMensualOperaciones: 200000,
      numeroOperacionesMensuales: 20,
      origenRecursos: 'Ingresos por construcción de obra civil',
      destinoRecursos: 'Pago de renta del bien arrendado y operación',
      operaComercioExterior: false,
      paisesComercioExterior: null,
      realizaDivisas: false,
      realizaTransferenciasInternacionales: false,
    },
    pep: {
      esPEP: false,
      cargoPEP: null,
      periodoPEP: null,
      familiarPEP: false,
      nombreFamiliarPEP: null,
      parentescoPEP: null,
      cargoFamiliarPEP: null,
    },
    referenciasBancarias: [
      { banco: 'BBVA México', tipoCuenta: 'Cheques', numeroCuenta: '**** **** **** 1234', antiguedad: '10 años' },
      { banco: 'Santander',    tipoCuenta: 'Crédito', numeroCuenta: '**** **** **** 5678', antiguedad: '4 años' },
    ],
    referenciasComerciales: [
      { nombre: 'Cementos del Bajío SA de CV', giro: 'Materiales', telefono: '4771234567', email: 'ventas@cementosbajio.demo', antiguedad: '6 años', lineaCredito: 250000 },
      { nombre: 'Aceros Industriales SA',       giro: 'Aceros',      telefono: '5598765432', email: null, antiguedad: '3 años', lineaCredito: 150000 },
    ],
    obligadosSolidarios: [
      {
        tipo: 'PFAE',
        nombre: 'DEMO MARÍA',
        apellidoPaterno: 'GARCÍA',
        apellidoMaterno: 'LÓPEZ',
        razonSocial: null,
        rfc: 'GALM820215CD3',
        curp: 'GALM820215MDFRPR04',
        fechaNacimiento: '1982-02-15',
        email: 'maria.demo@example.com',
        telefono: '5533445566',
        relacion: 'Socia comercial',
        ingresoMensual: 150000,
        ocupacion: 'Comerciante',
      },
    ],
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
