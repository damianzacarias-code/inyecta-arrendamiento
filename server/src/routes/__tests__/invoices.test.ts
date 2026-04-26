/**
 * Tests happy-path para GET /api/invoices y GET /api/invoices/:id.
 *
 * Misma estrategia de mock que clients.test.ts y contracts.test.ts.
 *
 * Cubre:
 *   - 401 sin token
 *   - 200 lista (sin paginación, devuelve {invoices: [...]})
 *   - filtros contractId / clientId / status → al where
 *   - serialización de Decimals (subtotal/iva/retenciones/total → number)
 *   - 200 detalle con relaciones
 *   - 404 cuando findUnique devuelve null
 *
 * Aclaración: la ruta GET / NO usa paginación (a diferencia de clients
 * y contracts). El response es {invoices: [...]} sin total/page/pages.
 * Es una decisión de la API; los tests validan el contrato real, no
 * uniformidad inexistente.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockPrisma = {
  invoice: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
};

vi.mock('../../config/db', () => ({
  default: mockPrisma,
}));

// El módulo invoices.ts importa fs+path para crear FACTURAS_DIR en module scope.
// Eso es OK en tests; mkdirSync es idempotente con recursive:true.
// Importar DESPUÉS del mock para que la ruta resuelva al fake. Se hace
// en beforeAll (no top-level await) para mantener tsconfig en
// `module: commonjs`. vi.mock se hoistea, así que el mock ya está
// activo cuando este import resuelve.
let invoiceRoutes: express.Router;
let errorHandler: express.ErrorRequestHandler;

beforeAll(async () => {
  invoiceRoutes = (await import('../invoices')).default as express.Router;
  errorHandler = (await import('../../middleware/errorHandler')).errorHandler;
});

const JWT_SECRET = 'test-secret-only-for-vitest-do-not-use-anywhere-else-32';

function signTestToken(): string {
  return jwt.sign(
    { userId: 'usr-test', email: 'test@inyecta.com', rol: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', invoiceRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/invoices', () => {
  const auth = `Bearer ${signTestToken()}`;

  it('devuelve 401 sin token', async () => {
    const res = await request(makeApp()).get('/api/invoices');
    expect(res.status).toBe(401);
    expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('devuelve 200 con shape {invoices: [...]} y serializa Decimals a number', async () => {
    // Prisma devuelve Decimals como instancias con .toString(); el route
    // las convierte a number con Number(). Aquí simulamos eso devolviendo
    // strings (típico Decimal.toJSON) para verificar la conversión.
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        folio: 'A-001',
        subtotal: '1000.00',
        iva: '160.00',
        retenciones: '0.00',
        total: '1160.00',
        contract: { folio: 'CTR-001', producto: 'PURO' },
        client: { tipo: 'PFAE', nombre: 'Juan' },
        payment: { id: 'pmt-1', periodo: 1, fechaPago: '2026-01-01' },
      },
    ]);

    const res = await request(makeApp()).get('/api/invoices').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(1);
    const inv = res.body.invoices[0];
    expect(typeof inv.subtotal).toBe('number');
    expect(typeof inv.iva).toBe('number');
    expect(typeof inv.retenciones).toBe('number');
    expect(typeof inv.total).toBe('number');
    expect(inv.subtotal).toBe(1000);
    expect(inv.total).toBe(1160);
  });

  it('sin filtros: where vacío {} (lista todas)', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await request(makeApp()).get('/api/invoices').set('Authorization', auth);

    const callArgs = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({});
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('filtros contractId/clientId/status se propagan al where', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await request(makeApp())
      .get('/api/invoices?contractId=k1&clientId=c1&status=TIMBRADA')
      .set('Authorization', auth);

    const where = mockPrisma.invoice.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      contractId: 'k1',
      clientId: 'c1',
      status: 'TIMBRADA',
    });
  });

  it('include carga contract, client y payment con campos seleccionados', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await request(makeApp()).get('/api/invoices').set('Authorization', auth);

    const include = mockPrisma.invoice.findMany.mock.calls[0][0].include;
    expect(include.contract.select).toMatchObject({ folio: true, producto: true });
    expect(include.client.select).toMatchObject({
      tipo: true, nombre: true, apellidoPaterno: true,
      razonSocial: true, rfc: true,
    });
    expect(include.payment.select).toMatchObject({
      id: true, periodo: true, fechaPago: true,
    });
  });

  it('lista vacía: {invoices: []}', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const res = await request(makeApp()).get('/api/invoices').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toEqual([]);
  });
});

describe('GET /api/invoices/:id', () => {
  const auth = `Bearer ${signTestToken()}`;

  it('devuelve 200 con detalle completo + Decimals serializados', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      uuid: 'AAA-BBB-CCC',
      subtotal: '500.50',
      iva: '80.08',
      retenciones: '0.00',
      total: '580.58',
      contract: { id: 'k1', folio: 'CTR-001', producto: 'FINANCIERO' },
      client: { id: 'c1', tipo: 'PM', razonSocial: 'ACME SA' },
      payment: { id: 'pmt-1', periodo: 5 },
    });

    const res = await request(makeApp()).get('/api/invoices/inv-1').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('inv-1');
    expect(res.body.uuid).toBe('AAA-BBB-CCC');
    expect(typeof res.body.subtotal).toBe('number');
    expect(res.body.subtotal).toBeCloseTo(500.5, 2);
    expect(res.body.total).toBeCloseTo(580.58, 2);

    const callArgs = mockPrisma.invoice.findUnique.mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: 'inv-1' });
  });

  it('devuelve 404 cuando la factura no existe', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/invoices/no-existe').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Factura no encontrada');
  });

  it('devuelve 401 sin token (no llega a Prisma)', async () => {
    const res = await request(makeApp()).get('/api/invoices/inv-1');
    expect(res.status).toBe(401);
    expect(mockPrisma.invoice.findUnique).not.toHaveBeenCalled();
  });
});
