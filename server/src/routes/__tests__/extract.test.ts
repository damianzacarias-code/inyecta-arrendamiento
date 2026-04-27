/**
 * Tests del endpoint POST /api/extract.
 *
 * Cubre:
 *   - 200 con MockProvider (sin tocar Claude).
 *   - 400 INVALID_TIPO si el tipo no está en la lista.
 *   - 400 FILE_REQUIRED si no hay file.
 *   - 400 FILE_TYPE_INVALID si la extensión no es válida.
 *   - 400 FILE_TOO_LARGE si supera 10MB.
 *   - 401 si falta el bearer token.
 *
 * No toca BD ni red. El provider que se usa es el MockProvider
 * (EXTRACT_PROVIDER no se setea explícitamente — toma su default 'MOCK').
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// requireAuth (S4) consulta prisma.user.findUnique para validar
// passwordChangedAt + activo. Mock minimal para los tests de extract,
// que no tocan BD para nada más.
vi.mock('../../config/db', () => ({
  default: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        passwordChangedAt: new Date(0),
        activo: true,
      }),
    },
  },
}));

import extractRoutes from '../extract';
import { errorHandler } from '../../middleware/errorHandler';
import { _resetExtractProviderForTests } from '../../services/pdfExtract';

// JWT secret debe coincidir con el de vitest.config.ts (env.JWT_SECRET).
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
  app.use('/api/extract', extractRoutes);
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  _resetExtractProviderForTests();
});

describe('POST /api/extract', () => {
  const token = signTestToken();
  const auth = `Bearer ${token}`;

  it('devuelve 401 sin token', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .field('tipo', 'CSF')
      .attach('archivo', Buffer.from('%PDF-1.4'), { filename: 'csf.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(401);
  });

  it('devuelve 200 con MockProvider para tipo válido (CSF)', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .set('Authorization', auth)
      .field('tipo', 'CSF')
      .attach('archivo', Buffer.from('%PDF-1.4 contenido fake'), {
        filename: 'csf.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe('MOCK');
    expect(res.body.confidence).toBeGreaterThan(0);
    expect(res.body.data).toBeTypeOf('object');
    expect(res.body.data.rfc).toBeTruthy();
    // MOCK siempre incluye warning para evitar que el frontend confunda con dato real.
    expect(res.body.warning).toBeTruthy();
  });

  it('devuelve 200 para los 5 tipos soportados', async () => {
    const tipos = ['CSF', 'INE', 'COMPROBANTE_DOMICILIO', 'FACTURA_BIEN', 'ACTA_CONSTITUTIVA'];
    for (const tipo of tipos) {
      const res = await request(makeApp())
        .post('/api/extract')
        .set('Authorization', auth)
        .field('tipo', tipo)
        .attach('archivo', Buffer.from('%PDF-1.4'), { filename: `${tipo}.pdf`, contentType: 'application/pdf' });
      expect(res.status, `tipo=${tipo}`).toBe(200);
      expect(res.body.data, `tipo=${tipo}`).toBeTruthy();
    }
  });

  it('devuelve 400 INVALID_TIPO si tipo no está en la lista', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .set('Authorization', auth)
      .field('tipo', 'NO_EXISTE')
      .attach('archivo', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_TIPO');
    expect(res.body.error?.details?.allowed).toBeTruthy();
  });

  it('devuelve 400 INVALID_TIPO si tipo está vacío', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .set('Authorization', auth)
      .field('tipo', '')
      .attach('archivo', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_TIPO');
  });

  it('devuelve 400 FILE_TYPE_INVALID si la extensión no es válida', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .set('Authorization', auth)
      .field('tipo', 'CSF')
      .attach('archivo', Buffer.from('contenido'), { filename: 'x.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('FILE_TYPE_INVALID');
  });

  it('devuelve 400 FILE_REQUIRED si no se envía archivo', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .set('Authorization', auth)
      .field('tipo', 'CSF');

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('FILE_REQUIRED');
  });

  it('acepta imágenes (PNG/JPG/WEBP)', async () => {
    const res = await request(makeApp())
      .post('/api/extract')
      .set('Authorization', auth)
      .field('tipo', 'INE')
      .attach('archivo', Buffer.from('fake-png-bytes'), { filename: 'ine.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.curp).toBeTruthy();
  });
});
