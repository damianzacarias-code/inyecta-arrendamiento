/**
 * Tests del cableado catálogo → extracción del flujo borrador.
 *
 * Cubre la ampliación del 10-06-2026 (decisión Damián):
 *   - El borrador auto-extrae TODOS los tipos con extractor disponible,
 *     no solo INE/CSF/COMPROBANTE.
 *   - El tipoDocumento del catálogo se traduce al TipoExtract del
 *     módulo pdfExtract (FACTURA→FACTURA_BIEN, ESTADOS_CUENTA→
 *     ESTADO_CUENTA, etc.).
 *   - Los docs de la operación (factura, tabla, carátula, CFDI) se
 *     extraen pero NO mergean datos al actor (no son docs de persona).
 *   - El estado de cuenta puebla los datos bancarios del actor.
 */
import { describe, it, expect } from 'vitest';
import {
  esTipoDocSoportado,
  extractTipoParaDoc,
  camposPorTipoDoc,
} from '../operationDraft';
import { TIPOS_EXTRACT } from '../pdfExtract';
import { SCHEMAS_BY_TIPO } from '../pdfExtract/schemas';

describe('extractTipoParaDoc — mapeo catálogo → TipoExtract', () => {
  it('mapea los tipos con clave distinta entre catálogo y extractor', () => {
    expect(extractTipoParaDoc('FACTURA')).toBe('FACTURA_BIEN');
    expect(extractTipoParaDoc('ESTADOS_CUENTA')).toBe('ESTADO_CUENTA'); // persona (plural)
  });

  it('ESTADO_CUENTA singular (formalización) NO se extrae — regla del architecture-reviewer', () => {
    // Es el estado de cuenta DEL CONTRATO que emite Inyecta: trae la
    // CLABE de FSMP. Extraerlo + mergearlo escribiría datos bancarios
    // de FSMP en el actor (riesgo de dispersión en v0.2).
    expect(extractTipoParaDoc('ESTADO_CUENTA')).toBeNull();
    expect(esTipoDocSoportado('ESTADO_CUENTA')).toBe(false);
  });

  it('mapea identidad para los tipos con la misma clave', () => {
    for (const tipo of [
      'INE', 'CSF', 'COMPROBANTE_DOMICILIO', 'ACTA_CONSTITUTIVA',
      'SOLICITUD', 'TABLA_AMORTIZACION', 'CARATULA', 'CFDI_RENTA',
    ]) {
      expect(extractTipoParaDoc(tipo)).toBe(tipo);
    }
  });

  it('devuelve null para tipos sin extractor (no truena)', () => {
    expect(extractTipoParaDoc('PAGARE')).toBeNull();
    expect(extractTipoParaDoc('OTRO')).toBeNull();
    expect(extractTipoParaDoc('REPORTE_BURO')).toBeNull();
  });

  it('todo TipoExtract mapeado existe realmente en el módulo pdfExtract', () => {
    const conocidos = new Set<string>(TIPOS_EXTRACT);
    for (const catalogo of [
      'INE', 'CSF', 'COMPROBANTE_DOMICILIO', 'FACTURA', 'ACTA_CONSTITUTIVA',
      'SOLICITUD', 'ESTADOS_CUENTA', 'TABLA_AMORTIZACION',
      'CARATULA', 'CFDI_RENTA',
    ]) {
      const extract = extractTipoParaDoc(catalogo);
      expect(extract, `${catalogo} debe mapear a un TipoExtract`).not.toBeNull();
      expect(conocidos.has(extract!), `${extract} debe existir en TIPOS_EXTRACT`).toBe(true);
    }
  });
});

describe('esTipoDocSoportado — gating de auto-extracción', () => {
  it('acepta los tipos cableados', () => {
    expect(esTipoDocSoportado('INE')).toBe(true);
    expect(esTipoDocSoportado('FACTURA')).toBe(true);
    expect(esTipoDocSoportado('ESTADOS_CUENTA')).toBe(true);
    expect(esTipoDocSoportado('TABLA_AMORTIZACION')).toBe(true);
  });

  it('rechaza tipos sin extractor', () => {
    expect(esTipoDocSoportado('PAGARE')).toBe(false);
    expect(esTipoDocSoportado('OTRO')).toBe(false);
  });
});

describe('camposPorTipoDoc — qué se mergea al actor', () => {
  it('ESTADO_CUENTA puebla datos bancarios del actor', () => {
    const merged = camposPorTipoDoc('ESTADO_CUENTA', {
      banco: 'BBVA',
      clabe: '012345678901234567',
      numeroCuenta: '0123456789',
      titular: 'Juan Pérez',
      saldoFinal: 150000,
    });
    expect(merged.banco).toBe('BBVA');
    expect(merged.clabe).toBe('012345678901234567');
    expect(merged.numeroCuenta).toBe('0123456789');
    // Los saldos NO van al actor (son del documento, no de la persona).
    expect(merged.saldoFinal).toBeUndefined();
  });

  it('ACTA_CONSTITUTIVA puebla identidad corporativa', () => {
    const merged = camposPorTipoDoc('ACTA_CONSTITUTIVA', {
      razonSocial: 'Demo SA de CV',
      fechaConstitucion: '2018-03-15',
      capitalSocial: 500000,
      notario: 'Lic. X',
    });
    expect(merged.razonSocial).toBe('Demo SA de CV');
    expect(merged.fechaConstitucion).toBe('2018-03-15');
    expect(merged.capitalSocial).toBe(500000);
  });

  it('SOLICITUD aplana la sección del solicitante PFAE', () => {
    const merged = camposPorTipoDoc('SOLICITUD', {
      tipoSolicitante: 'PFAE',
      solicitantePFAE: {
        nombre: 'JUAN', apellidoPaterno: 'PÉREZ', rfc: 'PEGJ800101AB1',
        curp: 'PEGJ800101HDFRRN02', email: 'j@x.com', ingresoMensual: 180000,
        calle: 'Av. Reforma', codigoPostal: '06000',
      },
      solicitantePM: null,
    });
    expect(merged.nombre).toBe('JUAN');
    expect(merged.rfc).toBe('PEGJ800101AB1');
    expect(merged.ingresoMensual).toBe(180000);
    expect(merged.calle).toBe('Av. Reforma');
  });

  it('SOLICITUD aplana la sección del solicitante PM', () => {
    const merged = camposPorTipoDoc('SOLICITUD', {
      tipoSolicitante: 'PM',
      solicitantePFAE: null,
      solicitantePM: {
        razonSocial: 'Demo SA de CV', rfc: 'DEM050101AB1',
        fechaConstitucion: '2018-03-15', capitalSocial: 500000,
        email: 'contacto@demo.mx',
      },
    });
    expect(merged.razonSocial).toBe('Demo SA de CV');
    expect(merged.rfc).toBe('DEM050101AB1');
    expect(merged.capitalSocial).toBe(500000);
  });

  it('docs de la operación NO mergean nada al actor', () => {
    expect(camposPorTipoDoc('FACTURA_BIEN', { proveedor: 'X', valorBienConIVA: 100 })).toEqual({});
    expect(camposPorTipoDoc('TABLA_AMORTIZACION', { plazoMeses: 48 })).toEqual({});
    expect(camposPorTipoDoc('CARATULA', { folioContrato: 'ARR-001-2026' })).toEqual({});
    expect(camposPorTipoDoc('CFDI_RENTA', { total: 116000 })).toEqual({});
  });
});

describe('schemas pdfExtract — los tipos nuevos existen y validan', () => {
  it('ESTADO_CUENTA, TABLA_AMORTIZACION, CARATULA y CFDI_RENTA tienen schema', () => {
    expect(SCHEMAS_BY_TIPO.ESTADO_CUENTA).toBeDefined();
    expect(SCHEMAS_BY_TIPO.TABLA_AMORTIZACION).toBeDefined();
    expect(SCHEMAS_BY_TIPO.CARATULA).toBeDefined();
    expect(SCHEMAS_BY_TIPO.CFDI_RENTA).toBeDefined();
  });

  it('estadoCuentaSchema acepta datos típicos y campos null', () => {
    const r = SCHEMAS_BY_TIPO.ESTADO_CUENTA.safeParse({
      banco: 'Banorte', titular: null, clabe: '072345678901234567',
      numeroCuenta: null, periodo: 'Enero 2026',
      saldoInicial: 10000.5, saldoFinal: 22000, totalDepositos: 50000, totalRetiros: 38000.5,
    });
    expect(r.success).toBe(true);
  });

  it('cfdiRentaSchema acepta un CFDI de renta típico', () => {
    const r = SCHEMAS_BY_TIPO.CFDI_RENTA.safeParse({
      rfcEmisor: 'FSM190101AB1', emisor: 'FSMP Soluciones de Capital',
      rfcReceptor: 'PEGJ800101AB1', receptor: 'Juan Pérez',
      folioFiscal: '12345678-ABCD-1234-ABCD-123456789012',
      fecha: '2026-06-01', subtotal: 100000, iva: 16000, total: 116000,
    });
    expect(r.success).toBe(true);
  });
});
