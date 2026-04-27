/**
 * mfa.ts — TOTP (RFC 6238) + backup codes
 * --------------------------------------------------------------
 * CLAUDE.md §10 — Hardening de seguridad S5.
 *
 * Flujo de enrollment:
 *   1. POST /api/auth/mfa/setup → genera secret base32, lo guarda
 *      en User.mfaSecret (mfaEnabled=false), devuelve otpauth://
 *      URI + dataURL del QR. mfaEnabled SIGUE en false.
 *   2. POST /api/auth/mfa/verify-setup { token } → valida un código
 *      contra el secret pendiente. Si OK: mfaEnabled=true,
 *      mfaEnrolledAt=now, GENERA 10 backup codes (un solo show).
 *   3. POST /api/auth/login pide token MFA si mfaEnabled.
 *
 * Backup codes:
 *   - 10 códigos formato XXXX-XXXX (8 chars hex en mayúsculas).
 *   - Hash bcrypt 12 antes de persistir.
 *   - Mostrados al usuario UNA SOLA VEZ. Si los pierde y pierde
 *     también el TOTP, el ADMIN tiene que re-enrollarlo
 *     (POST /api/users/:id/mfa/reset).
 *
 * TOTP config:
 *   - Algorithm: SHA-1 (compatible con Google Authenticator, 1Password,
 *     Authy, Microsoft Authenticator). Aunque SHA-256/512 son "más
 *     seguros", en TOTP la mejora marginal no compensa romper
 *     compatibilidad con la base instalada.
 *   - Step: 30s. Window ±1 (acepta el código previo y el siguiente
 *     para tolerar drift de reloj o latencia de red).
 *   - Digits: 6. (8 sería más seguro pero rompe la mayoría de las
 *     apps autenticadoras).
 */
import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import prisma from '../config/db';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { childLogger } from './logger';

const log = childLogger('mfa');

// ── Configuración TOTP ─────────────────────────────────────────────
authenticator.options = {
  digits: 6,
  step:   30,
  window: 1,  // tolera ±30s de drift
};

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 8; // hex chars (4 bytes)

// ── Setup / Enrollment ─────────────────────────────────────────────

export interface MfaSetupResult {
  secret:    string;        // base32 — el cliente NO debería persistirlo,
                            // pero lo devolvemos por si quiere mostrar
                            // como fallback al QR.
  otpauthUri: string;       // otpauth://totp/...
  qrDataUrl:  string;       // data:image/png;base64,... — para <img src=...>
}

/**
 * setupMfa — paso 1: genera y persiste secret pendiente. NO marca
 * mfaEnabled (eso lo hace verifySetup tras confirmar un código).
 *
 * Si el usuario ya tiene mfaEnabled=true, lanzamos error: para
 * re-enrollar primero hay que disable o usar el reset de admin.
 */
export async function setupMfa(args: { userId: string; email: string }): Promise<MfaSetupResult> {
  const { userId, email } = args;

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, mfaEnabled: true },
  });
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
  }
  if (user.mfaEnabled) {
    throw new AppError(
      'MFA_ALREADY_ENABLED',
      'MFA ya está activo. Desactívalo primero o pide a un ADMIN que lo resetee.',
      409,
    );
  }

  const secret = authenticator.generateSecret();
  // Issuer + label visible en la app autenticadora.
  const issuer = (config.branding?.empresa?.razonSocial ?? 'Inyecta').slice(0, 30);
  const otpauthUri = authenticator.keyuri(email, issuer, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width:  240,
  });

  await prisma.user.update({
    where: { id: userId },
    data:  { mfaSecret: secret, mfaEnabled: false, mfaEnrolledAt: null },
  });
  log.info({ userId }, 'mfa setup iniciado (pending verify)');

  return { secret, otpauthUri, qrDataUrl };
}

/**
 * verifyMfaSetup — paso 2: el usuario ingresó un código TOTP de su
 * autenticador. Si valida contra el secret pendiente, marcamos
 * mfaEnabled=true y generamos 10 backup codes (mostrados UNA vez).
 */
export async function verifyMfaSetup(args: {
  userId: string;
  token:  string;
}): Promise<{ backupCodes: string[] }> {
  const { userId, token } = args;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
  }
  if (user.mfaEnabled) {
    throw new AppError('MFA_ALREADY_ENABLED', 'MFA ya está activo.', 409);
  }
  if (!user.mfaSecret) {
    throw new AppError('MFA_SETUP_PENDING', 'No hay setup MFA pendiente. Llama a /setup primero.', 400);
  }

  if (!authenticator.check(token, user.mfaSecret)) {
    throw new AppError('MFA_INVALID_TOKEN', 'Código MFA inválido.', 400);
  }

  // Genera 10 backup codes (formato XXXX-XXXX) y los hashea en su
  // forma NORMALIZADA (sin guión, upper) para que bcrypt.compare
  // funcione contra el input del usuario (que también normalizamos).
  const codes = generateBackupCodes(BACKUP_CODE_COUNT);
  const hashes = await Promise.all(
    codes.map((c) => bcrypt.hash(normalizeBackupCode(c), 12)),
  );

  await prisma.$transaction(async (tx) => {
    // Si ya hay backup codes (re-enrollment después de reset), los
    // borramos para no acumular.
    await tx.mfaBackupCode.deleteMany({ where: { userId } });
    await tx.mfaBackupCode.createMany({
      data: hashes.map((h) => ({ userId, hashedCode: h })),
    });
    await tx.user.update({
      where: { id: userId },
      data:  { mfaEnabled: true, mfaEnrolledAt: new Date() },
    });
  });

  log.info({ userId }, 'mfa enrollment confirmado');
  return { backupCodes: codes };
}

/**
 * verifyToken — usado en login con MFA enabled. Acepta:
 *   • Código TOTP válido (6 dígitos numéricos), o
 *   • Backup code formato XXXX-XXXX (consumido tras uso).
 *
 * Lanza AppError 401 MFA_REQUIRED si el código no valida.
 */
export async function verifyMfaToken(args: {
  userId: string;
  token:  string;
}): Promise<void> {
  const { userId, token } = args;
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, mfaEnabled: true, mfaSecret: true },
  });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    throw new AppError('MFA_NOT_ENABLED', 'MFA no está activo para este usuario.', 400);
  }

  // Detección por shape: TOTP es 6 dígitos puros; backup code tiene "-"
  // o letras (hex en mayúsculas).
  const totpShape = /^\d{6}$/.test(token);

  if (totpShape) {
    if (authenticator.check(token, user.mfaSecret)) return;
  } else {
    // Normaliza con el mismo helper que usamos al guardar.
    const normalized = normalizeBackupCode(token);
    const candidates = await prisma.mfaBackupCode.findMany({
      where:  { userId, consumedAt: null },
      select: { id: true, hashedCode: true },
    });
    for (const c of candidates) {
      if (await bcrypt.compare(normalized, c.hashedCode)) {
        // Consumir (one-time use).
        await prisma.mfaBackupCode.update({
          where: { id: c.id },
          data:  { consumedAt: new Date() },
        });
        log.info({ userId, codeId: c.id }, 'backup code consumido');
        return;
      }
    }
  }

  throw new AppError('MFA_INVALID_TOKEN', 'Código MFA inválido.', 401);
}

// ── Disable / Reset ────────────────────────────────────────────────

/**
 * disableMfa — el usuario voluntariamente desactiva su MFA. Requiere
 * un token MFA actual (TOTP o backup code) para evitar que el robo
 * de un JWT permita desactivar la 2FA del legítimo dueño.
 */
export async function disableMfa(args: { userId: string; token: string }): Promise<void> {
  await verifyMfaToken(args);
  await prisma.$transaction(async (tx) => {
    await tx.mfaBackupCode.deleteMany({ where: { userId: args.userId } });
    await tx.user.update({
      where: { id: args.userId },
      data:  { mfaEnabled: false, mfaSecret: null, mfaEnrolledAt: null },
    });
  });
  log.info({ userId: args.userId }, 'mfa desactivado por el usuario');
}

/**
 * adminResetMfa — un ADMIN borra el setup MFA de OTRO usuario (caso:
 * el usuario perdió su autenticador y todos los backup codes). El
 * usuario tendrá que re-enrollar al próximo login.
 */
export async function adminResetMfa(args: { userId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mfaBackupCode.deleteMany({ where: { userId: args.userId } });
    await tx.user.update({
      where: { id: args.userId },
      data:  { mfaEnabled: false, mfaSecret: null, mfaEnrolledAt: null },
    });
  });
  log.info({ userId: args.userId }, 'mfa reseteado por admin');
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * normalizeBackupCode — convierte cualquier variante del input del
 * usuario (`AB12-CD34`, `ab12cd34`, ` AB12 CD34 `, `AB12-CD34\n`) a
 * la forma canónica que persiste en BD (`AB12CD34`).
 */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * generateBackupCodes — N códigos formato XXXX-XXXX en hex mayúsculas.
 * Total entropy = N × 32 bits = 320 bits para 10 codes.
 */
export function generateBackupCodes(n: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = randomBytes(4).toString('hex').toUpperCase(); // 8 chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/**
 * isMfaEnabled — chequeo rápido para login (¿necesito pedir token MFA?).
 */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where:  { id: userId },
    select: { mfaEnabled: true },
  });
  return !!u?.mfaEnabled;
}
