/**
 * Verifica end-to-end /api/users:
 *   • GET     listado (ADMIN OK)
 *   • POST    crear nuevo usuario
 *   • POST    /reset-password — devuelve ok:true sin la contraseña
 *   • PATCH   /:id — edita nombre y rol
 *   • PATCH   /:id/deactivate y /:id/activate
 *   • Reglas anti-lockout:
 *       - 401 sin Authorization
 *       - 403 con rol ANALISTA
 *       - 409 EMAIL_EXISTS al duplicar
 *       - 409 SELF_DEACTIVATION cuando el ADMIN intenta desactivarse
 *
 * Levanta una mini-app Express con sólo /api/users + el errorHandler
 * (mismo orden que index.ts) para que las refines de Zod y AppError
 * salgan con el formato real { error: { code, message } }.
 *
 * Requiere DB up. El script crea/borra al final un usuario verify-XXX
 * para no contaminar la BD.
 *
 * Correr cuando se cambie routes/users.ts:
 *   npx tsx src/__verify__/users.verify.ts
 */
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import usersRoutes from '../routes/users';
import { errorHandler } from '../middleware/errorHandler';
import prisma from '../config/db';

function makeToken(userId: string, rol: string): string {
  return jwt.sign(
    { userId, email: `${userId}@local`, rol },
    config.jwtSecret,
    { expiresIn: '5m' },
  );
}

interface FetchResult<T = unknown> {
  status: number;
  body: T;
}

async function call<T = unknown>(
  port: number,
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<FetchResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* noop */
  }
  return { status: res.status, body: parsed as T };
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  // Necesitamos un ADMIN real en BD para que actorId === id case en self-tests.
  // Buscamos uno existente (creado por el seed). Si no hay, abortamos.
  const realAdmin = await prisma.user.findFirst({ where: { rol: 'ADMIN', activo: true } });
  if (!realAdmin) {
    console.error('verify error: no hay ningún ADMIN activo en BD. Corre `npm run db:seed` primero.');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(1);
  }

  const adminToken = makeToken(realAdmin.id, 'ADMIN');

  // S4: requireAuth ahora valida que el userId del JWT exista en BD
  // y esté activo. Crear un ANALISTA real (efímero) para el test de
  // 403; si ya existe (corridas anteriores que no limpiaron), lo
  // reutilizamos.
  const analistaStub = await prisma.user.upsert({
    where:  { email: 'verify-analista-stub@inyecta.local' },
    update: { activo: true },
    create: {
      email:    'verify-analista-stub@inyecta.local',
      password: '$2a$12$verifyanalistastubpasswdneverusedXXXXXXXXXXXXXXXXXXXXXX',
      nombre:   'VerifyAnalista',
      apellidos: 'Stub',
      rol:      'ANALISTA',
    },
  });
  const analistaToken = makeToken(analistaStub.id, 'ANALISTA');

  // Email único por corrida con timestamp para no colisionar entre runs.
  const stamp = Date.now();
  const email = `verify-${stamp}@inyecta.local`;

  const checks: Array<[string, () => Promise<boolean>]> = [];
  let createdId: string | null = null;

  // ── 1. Sin token → 401 ────────────────────────────────────────────
  checks.push(['GET /users sin token → 401', async () => {
    const r = await call(port, 'GET', '/api/users', null);
    return r.status === 401;
  }]);

  // ── 2. ANALISTA → 403 ──────────────────────────────────────────────
  checks.push(['GET /users como ANALISTA → 403', async () => {
    const r = await call(port, 'GET', '/api/users', analistaToken);
    return r.status === 403;
  }]);

  // ── 3. ADMIN listado → 200 ─────────────────────────────────────────
  checks.push(['GET /users como ADMIN → 200 + array', async () => {
    const r = await call<{ users: unknown[] }>(port, 'GET', '/api/users', adminToken);
    return r.status === 200 && Array.isArray(r.body.users);
  }]);

  // ── 4. POST crear ──────────────────────────────────────────────────
  checks.push(['POST /users crea usuario → 201', async () => {
    const r = await call<{ id: string; email: string }>(port, 'POST', '/api/users', adminToken, {
      email,
      password: 'TempPass#2026!Qq',
      nombre: 'Verify',
      apellidos: 'Script',
      rol: 'ANALISTA',
    });
    if (r.status !== 201) return false;
    if (r.body.email !== email) return false;
    createdId = r.body.id;
    return true;
  }]);

  // ── 5. POST mismo email → 409 EMAIL_EXISTS ─────────────────────────
  checks.push(['POST /users email duplicado → 409 EMAIL_EXISTS', async () => {
    const r = await call<{ error?: { code?: string } }>(port, 'POST', '/api/users', adminToken, {
      email,
      password: 'TempPass#2026!Qq',
      nombre: 'Otro',
      apellidos: 'Otro',
      rol: 'ANALISTA',
    });
    return r.status === 409 && r.body.error?.code === 'EMAIL_EXISTS';
  }]);

  // ── 6. PATCH edita rol y nombre ────────────────────────────────────
  checks.push(['PATCH /users/:id edita rol y nombre → 200', async () => {
    if (!createdId) return false;
    const r = await call<{ rol: string; nombre: string }>(
      port, 'PATCH', `/api/users/${createdId}`, adminToken,
      { nombre: 'VerifyEditado', rol: 'COBRANZA' },
    );
    return r.status === 200 && r.body.rol === 'COBRANZA' && r.body.nombre === 'VerifyEditado';
  }]);

  // ── 7. POST /reset-password no devuelve la contraseña ──────────────
  checks.push(['POST /:id/reset-password → ok:true sin password', async () => {
    if (!createdId) return false;
    const r = await call<{ ok?: boolean; password?: unknown }>(
      port, 'POST', `/api/users/${createdId}/reset-password`, adminToken,
      { password: 'NewSecur3#PassZx' },
    );
    return r.status === 200 && r.body.ok === true && !('password' in (r.body ?? {}));
  }]);

  // ── 8. PATCH /:id/deactivate ───────────────────────────────────────
  checks.push(['PATCH /:id/deactivate → activo:false', async () => {
    if (!createdId) return false;
    const r = await call<{ activo: boolean }>(
      port, 'PATCH', `/api/users/${createdId}/deactivate`, adminToken,
    );
    return r.status === 200 && r.body.activo === false;
  }]);

  // ── 9. PATCH /:id/activate ─────────────────────────────────────────
  checks.push(['PATCH /:id/activate → activo:true', async () => {
    if (!createdId) return false;
    const r = await call<{ activo: boolean }>(
      port, 'PATCH', `/api/users/${createdId}/activate`, adminToken,
    );
    return r.status === 200 && r.body.activo === true;
  }]);

  // ── 10. Self-deactivation bloqueada ───────────────────────────────
  checks.push(['ADMIN no puede desactivarse a sí mismo → 409 SELF_DEACTIVATION', async () => {
    const r = await call<{ error?: { code?: string } }>(
      port, 'PATCH', `/api/users/${realAdmin.id}/deactivate`, adminToken,
    );
    return r.status === 409 && r.body.error?.code === 'SELF_DEACTIVATION';
  }]);

  // ── 11. Self-demotion bloqueada (vía PATCH /:id) ──────────────────
  checks.push(['ADMIN no puede autodegradarse → 409 SELF_DEMOTION', async () => {
    const r = await call<{ error?: { code?: string } }>(
      port, 'PATCH', `/api/users/${realAdmin.id}`, adminToken, { rol: 'ANALISTA' },
    );
    return r.status === 409 && r.body.error?.code === 'SELF_DEMOTION';
  }]);

  // ── 12. PATCH /:id sin cambios → 400 ──────────────────────────────
  checks.push(['PATCH /:id sin campos → 400 (Zod refine "Sin cambios")', async () => {
    if (!createdId) return false;
    const r = await call(port, 'PATCH', `/api/users/${createdId}`, adminToken, {});
    return r.status === 400;
  }]);

  console.log('Corriendo verify de /api/users...');
  let failed = 0;
  for (const [label, run] of checks) {
    let ok = false;
    let err: string | null = null;
    try {
      ok = await run();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    console.log(`  ${ok ? '✓' : '✗'} ${label}${err ? ` (err: ${err})` : ''}`);
    if (!ok) failed += 1;
  }

  // Cleanup: borrar el usuario verify (no tiene relaciones, solo password).
  if (createdId) {
    try {
      await prisma.user.delete({ where: { id: createdId } });
      console.log(`\ncleanup: usuario ${email} borrado.`);
    } catch (e) {
      console.warn(`cleanup: no se pudo borrar usuario verify (${(e as Error).message}).`);
    }
  }

  console.log(failed === 0 ? '\nOK · todos los checks pasaron' : `\nFAIL · ${failed} check(s) fallaron`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('verify error:', err);
  try { await prisma.$disconnect(); } catch { /* noop */ }
  process.exit(1);
});
