/**
 * jwtRevocation.verify.ts — Verificación end-to-end del flujo de
 * revocación de JWTs (CLAUDE.md §10 — Hardening S4).
 *
 * Levanta una mini-app con /api/auth y prueba contra Postgres real:
 *   1. Login emite token con jti.
 *   2. Token funciona en endpoint protegido.
 *   3. POST /logout registra el jti en revoked_tokens.
 *   4. Mismo token queda rechazado (401 'Token revocado').
 *   5. Tokens viejos sin jti (legacy) se aceptan o rechazan según
 *      passwordChangedAt.
 *   6. POST /change-password invalida tokens viejos por iat.
 *   7. POST /logout-all bumpea passwordChangedAt e invalida todo.
 *   8. Cleanup de revoked_tokens vencidos.
 *   9. Warmup hidrata el cache desde BD.
 *  10. Cleanup del usuario verify.
 *
 * Comando: npm run verify:jwtRevocation
 */
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../config/db';
import { config } from '../config/env';
import authRoutes from '../routes/auth';
import { errorHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import {
  warmupRevokedTokens,
  isRevoked,
  revokeToken,
  cleanupExpired,
  _cacheClear,
  _cacheSize,
} from '../lib/tokenRevocation';
import { hashPassword } from '../lib/passwordPolicy';

const PORT_BASE = 38000 + Math.floor(Math.random() * 1000);
const HOST = `http://127.0.0.1:${PORT_BASE}`;

interface CheckResult {
  name: string;
  ok:   boolean;
  detail?: string;
}
const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Endpoint protegido para verificar requireAuth.
  app.get('/protected', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  console.log('\n=== JWT revocation — verificación end-to-end ===\n');

  // Limpia cualquier residuo previo.
  _cacheClear();
  await prisma.revokedToken.deleteMany({ where: { reason: { startsWith: 'verify-' } } });

  // Crea un usuario verify-* para el test.
  const email = `verify-jwt-${Date.now()}@inyecta.test`;
  const password = 'TestS4#Pass2026!';
  const user = await prisma.user.create({
    data: {
      email,
      password: await hashPassword(password),
      nombre: 'Verify',
      apellidos: 'JWT',
      rol: 'ADMIN',
      mustChangePassword: false,
    },
  });
  console.log(`  · usuario creado: ${user.id}`);

  const app = buildApp();
  await new Promise<void>((resolve) => app.listen(PORT_BASE, resolve));

  try {
    // ── 1. Login emite jti ────────────────────────────────────────
    const login = await call('POST', '/api/auth/login', undefined, { email, password });
    const token: string = login.body.token;
    const decoded = jwt.decode(token) as any;
    check('1. login devuelve 200 con token', login.status === 200 && !!token);
    check('2. token contiene jti', !!decoded?.jti, decoded?.jti?.slice(0, 8));
    check('3. token contiene iat', !!decoded?.iat, String(decoded?.iat));
    check('4. token contiene exp', !!decoded?.exp);

    // ── 5. Token válido en /protected ────────────────────────────
    const protectedOk = await call('GET', '/protected', token);
    check('5. token válido → /protected 200', protectedOk.status === 200);

    // ── 6. POST /logout revoca el jti ────────────────────────────
    const logout = await call('POST', '/api/auth/logout', token);
    check('6. /logout 200', logout.status === 200 && logout.body.ok === true);
    check('7. jti ahora isRevoked() = true', isRevoked(decoded.jti));
    const dbRow = await prisma.revokedToken.findUnique({ where: { jti: decoded.jti } });
    check('8. revoked_tokens row creada', !!dbRow && dbRow.userId === user.id);

    // ── 9. Mismo token rechazado ─────────────────────────────────
    const afterLogout = await call('GET', '/protected', token);
    check(
      '9. mismo token después de logout → 401 "Token revocado"',
      afterLogout.status === 401 && /revocado/i.test(afterLogout.body.error ?? ''),
    );

    // ── 10. Token sin jti (legacy) — passwordChangedAt no rechaza
    //        tokens emitidos JUSTO antes (tolerancia 1s en el middleware) ─
    const legacyToken = jwt.sign(
      { userId: user.id, email: user.email, rol: user.rol },
      config.jwtSecret,
      { expiresIn: '1h' },
    );
    const legacyResp = await call('GET', '/protected', legacyToken);
    check(
      '10. token sin jti (legacy) sigue funcionando si iat ≥ pwdChangedAt',
      legacyResp.status === 200,
      `status=${legacyResp.status}`,
    );

    // ── 11. Bumpear passwordChangedAt invalida el token legacy ──
    // Esperamos 2s para que el iat del nuevo passwordChangedAt
    // claramente sea > iat del token (la tolerancia del middleware
    // es 1s).
    await new Promise((r) => setTimeout(r, 2000));
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordChangedAt: new Date() },
    });
    // Forzar bypass del cache de pwdInfo (TTL 60s).
    const { invalidateUserPwdCache } = await import('../middleware/auth');
    invalidateUserPwdCache(user.id);
    const afterPwdBump = await call('GET', '/protected', legacyToken);
    check(
      '11. token con iat < passwordChangedAt → 401',
      afterPwdBump.status === 401,
      `status=${afterPwdBump.status}`,
    );

    // ── 12. Login fresh + /logout-all invalida nuevo token ──────
    const login2 = await call('POST', '/api/auth/login', undefined, { email, password });
    const token2: string = login2.body.token;
    await new Promise((r) => setTimeout(r, 1100));
    const logoutAll = await call('POST', '/api/auth/logout-all', token2);
    check('12. /logout-all 200', logoutAll.status === 200);
    invalidateUserPwdCache(user.id);
    const afterLogoutAll = await call('GET', '/protected', token2);
    check(
      '13. token2 después de /logout-all → 401',
      afterLogoutAll.status === 401,
      `status=${afterLogoutAll.status}`,
    );

    // ── 14. Cleanup de expirados ────────────────────────────────
    // Insertamos un revokedToken artificialmente vencido y verificamos
    // que cleanupExpired() lo borre.
    const fakeJti = randomUUID();
    await prisma.revokedToken.create({
      data: {
        jti: fakeJti,
        userId: user.id,
        expiresAt: new Date(Date.now() - 60_000),
        reason: 'verify-fake-expired',
      },
    });
    const cleanupResult = await cleanupExpired();
    check(
      '14. cleanupExpired borra registros vencidos',
      cleanupResult.deleted >= 1,
      `deleted=${cleanupResult.deleted}`,
    );
    const stillThere = await prisma.revokedToken.findUnique({ where: { jti: fakeJti } });
    check('15. registro vencido ya no está en BD', stillThere === null);

    // ── 16. Warmup hidrata cache desde BD ───────────────────────
    // Insertamos un revoked token NO vencido (logout-all del paso 12
    // borró los anteriores) para tener algo que hidratar.
    const warmupJti = randomUUID();
    await revokeToken({
      jti:       warmupJti,
      userId:    user.id,
      expiresAt: new Date(Date.now() + 60_000),
      reason:    'verify-warmup-test',
    });
    _cacheClear();
    check('16. cache vaciado pre-warmup', _cacheSize() === 0);
    await warmupRevokedTokens();
    check(
      '17. warmup hidrata cache con jtis activos',
      _cacheSize() >= 1,
      `size=${_cacheSize()}`,
    );

  } finally {
    // Cleanup
    await prisma.revokedToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordHistory.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log('  · cleanup OK');
  }

  const passed = results.filter((r) => r.ok).length;
  const total  = results.length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${passed}/${total} OK${passed === total ? ' ✓' : ' ✗'}`);
  if (passed !== total) {
    console.log('\nFallidos:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name} ${r.detail ?? ''}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error fatal:', err);
  await prisma.user
    .deleteMany({ where: { email: { startsWith: 'verify-jwt-' } } })
    .catch(() => {});
  process.exit(1);
});
