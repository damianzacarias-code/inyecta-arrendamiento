/**
 * Tests happy-path para GET /api/clients y GET /api/clients/:id.
 *
 * Estrategia: vi.mock('../../config/db') reemplaza el PrismaClient
 * default export con un fake que devuelve datos canned. Sin BD real,
 * sin red. Coincide con la convención del backend: tests unitarios y
 * rápidos; los end-to-end con Prisma real viven en src/__verify__/.
 *
 * Cubre:
 *   - 401 sin token (delega a requireAuth)
 *   - 200 lista paginada con shape {data, total, page, pages}
 *   - filtros por query (search, tipo, page, limit) → llegan a where/skip/take
 *   - 200 detalle con relaciones esperadas
 *   - 404 cuando findUnique devuelve null
 *
 * No cubre POST/PUT (validaciones complejas de Zod, transacciones) ni
 * la rama 500 (error de Prisma) — ese path lo cubre errorHandler.test
 * en el bloque A.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Mock de prisma ──────────────────────────────────────────────
// Debe ir ANTES del import de la ruta porque la ruta hace
// `import prisma from '../config/db'` en module scope.
const mockPrisma = {
  client: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  // requireAuth (S4) consulta passwordChangedAt + activo. Para tests
  // de rutas protegidas, devolvemos un user activo con changedAt = 0.
  user: {
    findUnique: vi.fn().mockResolvedValue({
      passwordChangedAt: new Date(0),
      activo: true,
    }),
  },
};

vi.mock('../../config/db', () => ({
  default: mockPrisma,
}));

// Importar DESPUÉS del mock para que la ruta resuelva al fake.
// Se hace en beforeAll (no top-level await) para mantener tsconfig en
// `module: commonjs` — top-level await requiere ES modules y rompería
// el build/test setup. vi.mock se hoistea al top, así que para cuando
// beforeAll corre, el mock ya está activo.
let clientRoutes: express.Router;
let errorHandler: express.ErrorRequestHandler;

beforeAll(async () => {
  clientRoutes = (await import('../clients')).default as express.Router;
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
  app.use('/api/clients', clientRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/clients', () => {
  const auth = `Bearer ${signTestToken()}`;

  it('devuelve 401 sin token', async () => {
    const res = await request(makeApp()).get('/api/clients');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token de autenticación requerido');
  });

  it('devuelve 200 + shape estándar {data,total,page,pages} con defaults', async () => {
    mockPrisma.client.findMany.mockResolvedValue([
      { id: 'c1', tipo: 'PFAE', nombre: 'Juan', _count: { cotizaciones: 2, contratos: 1 } },
      { id: 'c2', tipo: 'PM', razonSocial: 'ACME SA', _count: { cotizaciones: 0, contratos: 0 } },
    ]);
    mockPrisma.client.count.mockResolvedValue(42);

    const res = await request(makeApp()).get('/api/clients').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(42);
    expect(res.body.page).toBe(1);
    // 42 / 20 → 3 páginas (ceil)
    expect(res.body.pages).toBe(3);

    // Verificar query: defaults page=1, limit=20 → skip=0, take=20
    const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(0);
    expect(callArgs.take).toBe(20);
    expect(callArgs.where).toEqual({ activo: true });
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('paginación: page=3 limit=10 → skip=20 take=10', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    const res = await request(makeApp())
      .get('/api/clients?page=3&limit=10')
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(20);
    expect(callArgs.take).toBe(10);
    expect(res.body.page).toBe(3);
  });

  it('filtro tipo=PM lo propaga al where', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    await request(makeApp())
      .get('/api/clients?tipo=PM')
      .set('Authorization', auth);

    const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ activo: true, tipo: 'PM' });
  });

  it('filtro search arma OR sobre nombre/apellido/razonSocial/rfc/email', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    await request(makeApp())
      .get('/api/clients?search=acme')
      .set('Authorization', auth);

    const where = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(where.activo).toBe(true);
    expect(where.OR).toBeInstanceOf(Array);
    expect(where.OR).toHaveLength(5);
    // Cada cláusula debe usar contains insensitive con el search
    where.OR.forEach((clause: any) => {
      const field = Object.keys(clause)[0];
      expect(clause[field]).toEqual({ contains: 'acme', mode: 'insensitive' });
    });
    // Y debe cubrir los 5 campos esperados
    const fields = where.OR.map((c: any) => Object.keys(c)[0]).sort();
    expect(fields).toEqual(['apellidoPaterno', 'email', 'nombre', 'razonSocial', 'rfc']);
  });

  it('cálculo de pages cuando total no divide exactamente', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(21);

    const res = await request(makeApp()).get('/api/clients').set('Authorization', auth);
    // 21 / 20 = 1.05 → ceil = 2
    expect(res.body.pages).toBe(2);
  });
});

describe('GET /api/clients/:id', () => {
  const auth = `Bearer ${signTestToken()}`;

  it('devuelve 200 con relaciones (socios, RL, cotizaciones, contratos, notas)', async () => {
    const fakeClient = {
      id: 'c-123',
      tipo: 'PM',
      razonSocial: 'ACME SA',
      socios: [{ id: 's1', porcentaje: '50' }],
      representanteLegalData: { id: 'rl1', nombre: 'Pepe' },
      cotizaciones: [],
      contratos: [],
      notas: [],
    };
    mockPrisma.client.findUnique.mockResolvedValue(fakeClient);

    const res = await request(makeApp()).get('/api/clients/c-123').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('c-123');
    expect(res.body.razonSocial).toBe('ACME SA');
    expect(res.body.socios).toHaveLength(1);

    // Verificar que pidió las relaciones correctas
    const callArgs = mockPrisma.client.findUnique.mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: 'c-123' });
    expect(callArgs.include).toMatchObject({
      socios: true,
      representanteLegalData: true,
      cotizaciones: expect.any(Object),
      contratos: expect.any(Object),
      notas: expect.any(Object),
    });
    // Cotizaciones limit 10 (per route)
    expect(callArgs.include.cotizaciones.take).toBe(10);
    expect(callArgs.include.contratos.take).toBe(10);
    expect(callArgs.include.notas.take).toBe(20);
  });

  it('devuelve 404 cuando el cliente no existe', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/clients/no-existe').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Cliente no encontrado');
  });

  it('devuelve 401 sin token (no llega a Prisma)', async () => {
    const res = await request(makeApp()).get('/api/clients/c-123');
    expect(res.status).toBe(401);
    expect(mockPrisma.client.findUnique).not.toHaveBeenCalled();
  });
});
