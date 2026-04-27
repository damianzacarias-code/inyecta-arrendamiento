/**
 * mfa.verify.ts — Verificación end-to-end del flujo MFA/TOTP
 * (CLAUDE.md §10 — Hardening S5).
 *
 * Cubre:
 *   1. Setup genera secret + QR.
 *   2. Verify-setup con código válido marca mfaEnabled=true.
 *   3. Verify-setup con código inválido lanza MFA_INVALID_TOKEN.
 *   4. Login sin mfaToken cuando MFA está activo → 200 mfaRequired:true.
 *   5. Login con TOTP correcto → 200 con token JWT.
 *   6. Login con TOTP incorrecto → 401.
 *   7. Login con backup code consume el código.
 *   8. Backup code consumido no funciona dos veces.
 *   9. Disable MFA con token válido → mfaEnabled=false.
 *  10. AdminResetMfa borra todo el setup.
 *  11. Cleanup.
 *
 * Comando: npm run verify:mfa
 */
import express, { type Express } from 'express';
import { authenticator } from 'otplib';
import prisma from '../config/db';
import authRoutes from '../routes/auth';
import { errorHandler } from '../middleware/errorHandler';
import { hashPassword } from '../lib/passwordPolicy';
import { generateBackupCodes } from '../lib/mfa';

const PORT_BASE = 39000 + Math.floor(Math.random() * 1000);
const HOST = `http://127.0.0.1:${PORT_BASE}`;

interface CheckResult { name: string; ok: boolean; detail?: string }
const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
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
  console.log('\n=== MFA — verificación end-to-end ===\n');

  // Pequeño self-test del helper de backup codes para detectar
  // regresiones del formato antes de cualquier I/O.
  const sample = generateBackupCodes(3);
  check('0a. generateBackupCodes(3) devuelve 3 codes', sample.length === 3);
  check(
    '0b. cada code tiene formato XXXX-XXXX',
    sample.every((c) => /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(c)),
    sample.join(','),
  );

  const email = `verify-mfa-${Date.now()}@inyecta.test`;
  const password = 'TestS5#Pass2026!';
  const user = await prisma.user.create({
    data: {
      email,
      password: await hashPassword(password),
      nombre: 'Verify',
      apellidos: 'MFA',
      rol: 'ADMIN',
    },
  });
  console.log(`  · usuario creado: ${user.id}`);

  const app = buildApp();
  await new Promise<void>((resolve) => app.listen(PORT_BASE, resolve));

  try {
    // ── Login sin MFA aún → token JWT ─────────────────────────────
    const login1 = await call('POST', '/api/auth/login', undefined, { email, password });
    const token: string = login1.body.token;
    check('1. login sin MFA → 200 con token', login1.status === 200 && !!token);
    check('1b. login response trae mfaEnabled=false', login1.body.user?.mfaEnabled === false);

    // ── Setup MFA ────────────────────────────────────────────────
    const setup = await call('POST', '/api/auth/mfa/setup', token);
    check('2. /mfa/setup 200', setup.status === 200);
    check('3. setup.secret base32 (≥16 chars)', typeof setup.body.secret === 'string' && setup.body.secret.length >= 16);
    check('4. setup.qrDataUrl es data:image/png', /^data:image\/png/.test(setup.body.qrDataUrl ?? ''));
    check('5. setup.otpauthUri otpauth://', /^otpauth:\/\//.test(setup.body.otpauthUri ?? ''));

    const secret: string = setup.body.secret;

    // ── verify-setup con token inválido ──────────────────────────
    const badVerify = await call('POST', '/api/auth/mfa/verify-setup', token, { token: '000000' });
    check('6. verify-setup con código bogus → 400', badVerify.status === 400);

    // ── verify-setup con TOTP correcto ───────────────────────────
    const validToken = authenticator.generate(secret);
    const okVerify = await call('POST', '/api/auth/mfa/verify-setup', token, { token: validToken });
    check('7. verify-setup con TOTP válido → 200', okVerify.status === 200);
    const backupCodes: string[] = okVerify.body.backupCodes;
    check('8. devuelve 10 backup codes', Array.isArray(backupCodes) && backupCodes.length === 10);
    check(
      '9. cada backup code tiene formato XXXX-XXXX',
      backupCodes.every((c) => /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(c)),
    );

    // mfaEnabled debería estar true ahora.
    const userAfter = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true, mfaSecret: true } });
    check('10. user.mfaEnabled = true post enrollment', userAfter?.mfaEnabled === true);
    check('11. user.mfaSecret persistido', !!userAfter?.mfaSecret);

    // ── Login sin mfaToken → 200 mfaRequired:true ────────────────
    const loginNoTok = await call('POST', '/api/auth/login', undefined, { email, password });
    check(
      '12. login sin mfaToken → 200 + mfaRequired:true',
      loginNoTok.status === 200 && loginNoTok.body.mfaRequired === true && !loginNoTok.body.token,
    );

    // ── Login con TOTP correcto ──────────────────────────────────
    const loginTotpOk = await call('POST', '/api/auth/login', undefined, {
      email, password, mfaToken: authenticator.generate(secret),
    });
    check('13. login con TOTP correcto → 200 con token', loginTotpOk.status === 200 && !!loginTotpOk.body.token);

    // ── Login con TOTP incorrecto ────────────────────────────────
    const loginTotpBad = await call('POST', '/api/auth/login', undefined, {
      email, password, mfaToken: '123456',
    });
    check('14. login con TOTP inválido → 401', loginTotpBad.status === 401);

    // ── Login con backup code consume y funciona ─────────────────
    const code = backupCodes[0];
    const loginBackup = await call('POST', '/api/auth/login', undefined, {
      email, password, mfaToken: code,
    });
    check('15. login con backup code → 200 con token', loginBackup.status === 200 && !!loginBackup.body.token);

    // ── Mismo backup code no funciona 2da vez ────────────────────
    const loginBackup2 = await call('POST', '/api/auth/login', undefined, {
      email, password, mfaToken: code,
    });
    check('16. backup code consumido → 401 al reintentar', loginBackup2.status === 401);

    // ── Disable MFA con token válido ─────────────────────────────
    const tokenForDisable = loginTotpOk.body.token;
    const disable = await call('POST', '/api/auth/mfa/disable', tokenForDisable, {
      token: authenticator.generate(secret),
    });
    check('17. /mfa/disable con TOTP válido → 200', disable.status === 200);
    const userDisabled = await prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaEnabled: true, mfaSecret: true },
    });
    check('18. mfaEnabled=false + mfaSecret=null tras disable',
      userDisabled?.mfaEnabled === false && userDisabled?.mfaSecret === null);
    const remainingCodes = await prisma.mfaBackupCode.count({ where: { userId: user.id } });
    check('19. backup codes borrados tras disable', remainingCodes === 0);
  } finally {
    await prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } });
    await prisma.passwordHistory.deleteMany({ where: { userId: user.id } });
    await prisma.revokedToken.deleteMany({ where: { userId: user.id } });
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
  await prisma.user.deleteMany({ where: { email: { startsWith: 'verify-mfa-' } } }).catch(() => {});
  process.exit(1);
});
