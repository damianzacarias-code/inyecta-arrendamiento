/**
 * Smoke test integration del errorHandler — dispara errores REALES de Prisma
 * y Zod (no mocks) contra una mini-app y valida la forma de la respuesta.
 *
 * Se ejecuta con:
 *   npx tsx src/__verify__/errorHandler.verify.ts
 *
 * No es un test unitario formal (el server no tiene Vitest configurado);
 * es un script de verificación end-to-end que prueba el contrato del
 * middleware contra los tipos de error reales que Prisma/Zod arrojan.
 */
import express from 'express';
import http from 'http';
import { z } from 'zod';
import prisma from '../config/db';
import { errorHandler, AppError, asyncHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());

// Ruta 1: AppError con status y details custom
app.get('/_test/app-error', (_req, _res, next) => {
  next(new AppError('CUSTOM_BIZ_RULE', 'Cliente no califica para arrendamiento', 422, { score: 580, minimo: 600 }));
});

// Ruta 2: ZodError lanzado (no atrapado inline)
app.get('/_test/zod', (req, _res, next) => {
  try {
    z.object({ email: z.string().email() }).parse({ email: req.query.email });
  } catch (e) { return next(e); }
});

// Ruta 3: Prisma P2002 — UNIQUE violation real (intenta crear user con email duplicado)
app.post('/_test/prisma-p2002', asyncHandler(async (_req, _res) => {
  // crea uno
  const email = `verify-${Date.now()}@test.local`;
  await prisma.user.create({ data: { email, password: 'x', nombre: 'V', apellidos: 'V', rol: 'ANALISTA' } });
  // intenta duplicar → P2002
  await prisma.user.create({ data: { email, password: 'x', nombre: 'V', apellidos: 'V', rol: 'ANALISTA' } });
}));

// Ruta 4: Prisma P2025 — update sobre id inexistente
app.post('/_test/prisma-p2025', asyncHandler(async (_req, _res) => {
  await prisma.user.update({
    where: { id: 'definitely-does-not-exist-zzzz' },
    data: { nombre: 'X' },
  });
}));

// Ruta 5: PrismaClientValidationError — pasar tipo incorrecto
app.post('/_test/prisma-validation', asyncHandler(async (_req, _res) => {
  // @ts-expect-error tipo inválido a propósito
  await prisma.user.findMany({ where: { email: 12345 } });
}));

// Ruta 6: Error genérico
app.get('/_test/generic', (_req, _res, _next) => {
  throw new Error('boom interno');
});

app.use(errorHandler);

const server = app.listen(0, async () => {
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no addr');
  const port = addr.port;

  const get = (path: string, method: 'GET'|'POST' = 'GET'): Promise<{status:number; body:string}> =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path, method, headers: {'content-type': 'application/json'} }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });
      req.on('error', reject);
      req.end();
    });

  const cases: Array<{name: string; path: string; method?: 'GET'|'POST'; expectStatus: number; expectCode: string}> = [
    { name: 'AppError 422',                path: '/_test/app-error',         expectStatus: 422, expectCode: 'CUSTOM_BIZ_RULE' },
    { name: 'ZodError → 400',              path: '/_test/zod?email=not-email', expectStatus: 400, expectCode: 'VALIDATION_ERROR' },
    { name: 'P2002 unique violation → 409', path: '/_test/prisma-p2002', method: 'POST', expectStatus: 409, expectCode: 'UNIQUE_VIOLATION' },
    { name: 'P2025 not found → 404',        path: '/_test/prisma-p2025', method: 'POST', expectStatus: 404, expectCode: 'NOT_FOUND' },
    { name: 'Prisma validation → 400',      path: '/_test/prisma-validation', method: 'POST', expectStatus: 400, expectCode: 'PRISMA_VALIDATION_ERROR' },
    { name: 'Error genérico → 500',         path: '/_test/generic',          expectStatus: 500, expectCode: 'INTERNAL_ERROR' },
  ];

  let passed = 0; let failed = 0;
  for (const c of cases) {
    const r = await get(c.path, c.method);
    let parsed: { error?: { code?: string } } = {};
    try { parsed = JSON.parse(r.body); } catch { /* deja vacío */ }
    const ok = r.status === c.expectStatus && parsed?.error?.code === c.expectCode;
    if (ok) { console.log(`  ✓ ${c.name.padEnd(40)} ${r.status} ${parsed.error?.code}`); passed++; }
    else    {
      console.log(`  ✗ ${c.name.padEnd(40)} got ${r.status} ${parsed.error?.code} | want ${c.expectStatus} ${c.expectCode}`);
      console.log(`    body: ${r.body.slice(0, 200)}`);
      failed++;
    }
  }

  // Cleanup: borrar el user que creamos en el test de P2002 (si quedó algo)
  await prisma.user.deleteMany({ where: { email: { startsWith: 'verify-' } } });

  console.log(`\n  ${passed}/${passed+failed} casos OK`);
  await prisma.$disconnect();
  server.close();
  process.exit(failed === 0 ? 0 : 1);
});
