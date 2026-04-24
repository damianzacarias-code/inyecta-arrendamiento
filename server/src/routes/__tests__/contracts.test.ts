/**
 * Tests happy-path para GET /api/contracts y GET /api/contracts/:id.
 *
 * Misma estrategia que clients.test.ts: vi.mock del PrismaClient,
 * supertest contra una mini app Express. Sin BD real.
 *
 * Cubre:
 *   - 401 sin token
 *   - 200 lista paginada con shape {data,total,page,pages,pipeline}
 *   - filtro etapa/estatus → llegan al where
 *   - pipeline armado desde STAGE_ORDER + groupBy
 *   - 200 detalle con relaciones
 *   - 404 cuando findUnique devuelve null
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockPrisma = {
  contract: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
};

vi.mock('../../config/db', () => ({
  default: mockPrisma,
}));

const { default: contractRoutes } = await import('../contracts');
const { errorHandler } = await import('../../middleware/errorHandler');

const JWT_SECRET = 'test-secret-only-for-vitest-do-not-use-anywhere-else-32';
const STAGE_ORDER = ['SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO'];

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
  app.use('/api/contracts', contractRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: groupBy vacío → pipeline con counts en 0
  mockPrisma.contract.groupBy.mockResolvedValue([]);
});

describe('GET /api/contracts', () => {
  const auth = `Bearer ${signTestToken()}`;

  it('devuelve 401 sin token', async () => {
    const res = await request(makeApp()).get('/api/contracts');
    expect(res.status).toBe(401);
    expect(mockPrisma.contract.findMany).not.toHaveBeenCalled();
  });

  it('devuelve shape estándar + pipeline con todas las etapas', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([
      { id: 'k1', folio: 'CTR-001', etapa: 'COMITE', client: { id: 'c1' }, user: { nombre: 'Op' } },
    ]);
    mockPrisma.contract.count.mockResolvedValue(1);
    mockPrisma.contract.groupBy.mockResolvedValue([
      { etapa: 'COMITE', _count: 3 },
      { etapa: 'ACTIVO', _count: 7 },
    ]);

    const res = await request(makeApp()).get('/api/contracts').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);

    // Pipeline en orden estricto STAGE_ORDER, con counts inyectados o 0
    expect(res.body.pipeline).toHaveLength(STAGE_ORDER.length);
    expect(res.body.pipeline.map((p: any) => p.stage)).toEqual(STAGE_ORDER);
    const comiteEntry = res.body.pipeline.find((p: any) => p.stage === 'COMITE');
    const activoEntry = res.body.pipeline.find((p: any) => p.stage === 'ACTIVO');
    const solicEntry = res.body.pipeline.find((p: any) => p.stage === 'SOLICITUD');
    expect(comiteEntry.count).toBe(3);
    expect(activoEntry.count).toBe(7);
    expect(solicEntry.count).toBe(0); // no apareció en groupBy
  });

  it('paginación default page=1 limit=50 → skip=0 take=50', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([]);
    mockPrisma.contract.count.mockResolvedValue(0);

    const res = await request(makeApp()).get('/api/contracts').set('Authorization', auth);

    expect(res.status).toBe(200);
    const callArgs = mockPrisma.contract.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(0);
    expect(callArgs.take).toBe(50);
  });

  it('filtros etapa y estatus se propagan al where', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([]);
    mockPrisma.contract.count.mockResolvedValue(0);

    await request(makeApp())
      .get('/api/contracts?etapa=ACTIVO&estatus=EN_PROCESO')
      .set('Authorization', auth);

    const where = mockPrisma.contract.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ etapa: 'ACTIVO', estatus: 'EN_PROCESO' });
  });

  it('pipeline groupBy filtra solo EN_PROCESO (no cuenta TERMINADO ni CANCELADO)', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([]);
    mockPrisma.contract.count.mockResolvedValue(0);

    await request(makeApp()).get('/api/contracts').set('Authorization', auth);

    const groupByArgs = mockPrisma.contract.groupBy.mock.calls[0][0];
    expect(groupByArgs.where).toEqual({ estatus: 'EN_PROCESO' });
    expect(groupByArgs.by).toEqual(['etapa']);
  });

  it('include carga client y user con campos seleccionados', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([]);
    mockPrisma.contract.count.mockResolvedValue(0);

    await request(makeApp()).get('/api/contracts').set('Authorization', auth);

    const include = mockPrisma.contract.findMany.mock.calls[0][0].include;
    expect(include.client.select).toMatchObject({
      id: true, tipo: true, nombre: true, apellidoPaterno: true,
      razonSocial: true, rfc: true,
    });
    expect(include.user.select).toMatchObject({ nombre: true, apellidos: true });
  });
});

describe('GET /api/contracts/:id', () => {
  const auth = `Bearer ${signTestToken()}`;

  it('devuelve 200 con todas las relaciones (client, KYC, actores, notas)', async () => {
    const fake = {
      id: 'k-1',
      folio: 'CTR-001',
      client: { id: 'c-1', tipo: 'PFAE', nombre: 'Juan' },
      proveedorData: { id: 'pv-1' },
      perfilTransaccional: { id: 'pt-1' },
      declaracionesPEP: [],
      actores: [],
      notas: [],
      stageHistory: [],
    };
    mockPrisma.contract.findUnique.mockResolvedValue(fake);

    const res = await request(makeApp()).get('/api/contracts/k-1').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('k-1');

    const callArgs = mockPrisma.contract.findUnique.mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: 'k-1' });
    // Las 8 relaciones críticas que el detalle del contrato requiere
    expect(callArgs.include).toMatchObject({
      client: true,
      user: expect.any(Object),
      categoria: expect.any(Object),
      stageHistory: expect.any(Object),
      proveedorData: true,
      perfilTransaccional: true,
      declaracionesPEP: true,
      actores: expect.any(Object),
      notas: expect.any(Object),
    });
  });

  it('devuelve 404 cuando el contrato no existe', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/contracts/no-existe').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Contrato no encontrado');
  });

  it('devuelve 401 sin token (no llega a Prisma)', async () => {
    const res = await request(makeApp()).get('/api/contracts/k-1');
    expect(res.status).toBe(401);
    expect(mockPrisma.contract.findUnique).not.toHaveBeenCalled();
  });
});
