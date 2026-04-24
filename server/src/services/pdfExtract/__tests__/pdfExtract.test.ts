/**
 * Tests del módulo pdfExtract — solo MockProvider y schemas.
 *
 * El ClaudeProvider NO se ejercita aquí (requiere ANTHROPIC_API_KEY y red).
 * Tampoco hay tests del endpoint en este archivo — esos viven en
 * routes/__tests__/extract.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  MockProvider,
  TIPOS_EXTRACT,
  computeConfidence,
  getSchemaForTipo,
} from '../index';

describe('MockProvider', () => {
  const provider = new MockProvider();

  it('expone name=MOCK', () => {
    expect(provider.name).toBe('MOCK');
  });

  it.each([...TIPOS_EXTRACT])('devuelve datos válidos para %s', async (tipo) => {
    const buf = Buffer.from('dummy');
    const res = await provider.extract(buf, 'application/pdf', tipo);

    expect(res.ok).toBe(true);
    expect(res.provider).toBe('MOCK');
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.data).toBeTypeOf('object');
    expect(Object.keys(res.data).length).toBeGreaterThan(0);
  });

  it('los datos del MOCK pasan validación Zod por tipo', async () => {
    for (const tipo of TIPOS_EXTRACT) {
      const res = await provider.extract(Buffer.from(''), 'application/pdf', tipo);
      const schema = getSchemaForTipo(tipo);
      const parsed = schema.safeParse(res.data);
      expect(parsed.success, `${tipo}: ${parsed.success ? '' : JSON.stringify(parsed.error?.errors)}`).toBe(true);
    }
  });

  it('CSF mock incluye RFC y régimen fiscal', async () => {
    const res = await provider.extract(Buffer.from(''), 'application/pdf', 'CSF');
    expect(res.data.rfc).toBeTruthy();
    expect(res.data.regimenFiscal).toBeTruthy();
  });

  it('FACTURA_BIEN mock incluye montos numéricos', async () => {
    const res = await provider.extract(Buffer.from(''), 'application/pdf', 'FACTURA_BIEN');
    expect(typeof res.data.valorBienConIVA).toBe('number');
    expect(typeof res.data.bienAnio).toBe('number');
  });

  it('confidence en MOCK es ≥0.5 (suficiente para no triggerear warning hard)', async () => {
    const res = await provider.extract(Buffer.from(''), 'application/pdf', 'INE');
    expect(res.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('SOLICITUD mock trae al menos solicitantePFAE + bien + operacion', async () => {
    const res = await provider.extract(Buffer.from(''), 'application/pdf', 'SOLICITUD');
    expect(res.ok).toBe(true);
    // Las 3 secciones mínimas para armar un contrato + cliente.
    expect(res.data.tipoSolicitante).toBeTruthy();
    expect(res.data.operacion).toBeTruthy();
    expect(res.data.bien).toBeTruthy();
    expect(res.data.solicitantePFAE).toBeTruthy();
    // PM y representante legal deben ser null cuando es PFAE.
    expect(res.data.solicitantePM).toBeNull();
    expect(res.data.representanteLegal).toBeNull();
    // Arrays vienen como arreglos (no null) cuando hay datos.
    expect(Array.isArray(res.data.referenciasBancarias)).toBe(true);
    expect(Array.isArray(res.data.obligadosSolidarios)).toBe(true);
  });

  it('SOLICITUD mock tiene montos numéricos y booleanos normalizados', async () => {
    const res = await provider.extract(Buffer.from(''), 'application/pdf', 'SOLICITUD');
    const pfae = res.data.solicitantePFAE as Record<string, unknown>;
    expect(typeof pfae.ingresoMensual).toBe('number');
    const bien = res.data.bien as Record<string, unknown>;
    expect(typeof bien.valorConIVA).toBe('number');
    expect(typeof bien.anio).toBe('number');
    expect(typeof bien.nuevo).toBe('boolean');
    const perfil = res.data.perfilTransaccional as Record<string, unknown>;
    expect(typeof perfil.operaComercioExterior).toBe('boolean');
  });
});

describe('computeConfidence', () => {
  it('1.0 cuando todos los campos están poblados', () => {
    const data = {
      rfc: 'XAXX010101000',
      razonSocial: 'Foo SA',
      curp: 'PEGJ800101HDFRRN02',
      regimenFiscal: '601',
      codigoPostal: '06000',
      domicilioFiscal: 'Reforma 100',
      fechaInicioOperaciones: '2018-01-01',
      estatusPadron: 'ACTIVO',
    };
    expect(computeConfidence('CSF', data)).toBeCloseTo(1, 5);
  });

  it('0 cuando todo es null', () => {
    const data: Record<string, unknown> = {
      rfc: null, razonSocial: null, curp: null, regimenFiscal: null,
      codigoPostal: null, domicilioFiscal: null, fechaInicioOperaciones: null, estatusPadron: null,
    };
    expect(computeConfidence('CSF', data)).toBe(0);
  });

  it('0 cuando los strings son vacíos', () => {
    const data: Record<string, unknown> = {
      rfc: '', razonSocial: '   ',
    };
    expect(computeConfidence('CSF', data)).toBe(0);
  });

  it('proporcional cuando algunos campos están poblados', () => {
    // CSF tiene 8 campos. Si 4 están poblados → 0.5.
    const data = {
      rfc: 'XAXX010101000',
      razonSocial: 'Foo SA',
      curp: null,
      regimenFiscal: '601',
      codigoPostal: '06000',
      domicilioFiscal: null,
      fechaInicioOperaciones: null,
      estatusPadron: null,
    };
    expect(computeConfidence('CSF', data)).toBeCloseTo(0.5, 5);
  });
});
