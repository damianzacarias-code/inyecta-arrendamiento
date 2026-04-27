/**
 * Política de contraseñas — Inyecta Arrendamiento
 * --------------------------------------------------------------
 * Centraliza las reglas de fuerza, hashing, historial y rotación
 * de contraseñas. Cubre §10 — Hardening de seguridad S1 (CLAUDE.md).
 *
 * Reglas aplicadas:
 *   • Longitud mínima 10 caracteres (NIST SP 800-63B recomienda ≥8;
 *     subimos a 10 porque el sistema almacena PII regulada por CNBV
 *     y maneja flujos financieros).
 *   • Complejidad: al menos un minúscula, un mayúscula, un dígito y
 *     un símbolo. Es estricto a propósito — el universo de usuarios
 *     son empleados de Inyecta, no clientes finales, así que la
 *     fricción extra está justificada.
 *   • Sin patrones triviales (12345, password, qwerty...).
 *   • No reutilizar las últimas 5 contraseñas (historial cifrado con
 *     bcrypt, mismo costo que la actual).
 *   • Bloqueo si contiene partes obvias del email/nombre/apellidos.
 *
 * Las reglas se aplican en TRES puntos:
 *   1. POST /api/users (alta de empleado)
 *   2. POST /api/users/:id/reset-password (reset por ADMIN)
 *   3. POST /api/auth/change-password (cambio voluntario o forzado)
 *
 * El módulo NO depende de Express — es puro: recibe inputs, valida,
 * persiste vía Prisma. Esto facilita testear casos negativos sin
 * levantar HTTP.
 */
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { AppError } from '../middleware/errorHandler';

// ── Constantes de la política ──────────────────────────────────────
export const PASSWORD_MIN_LENGTH      = 10;
export const PASSWORD_MAX_LENGTH      = 120;
export const PASSWORD_BCRYPT_ROUNDS   = 12;
export const PASSWORD_HISTORY_DEPTH   = 5;

// Patrones triviales rechazados completos o como substring largo. Lista
// breve a propósito — el chequeo de complejidad ya bloquea la mayoría;
// aquí cubrimos solo los más "cliché" que sortean complejidad por
// pura mala suerte (Password1!, Qwerty12!).
const PATRONES_TRIVIALES = [
  'password',
  'contraseña',
  'contrasena',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  '123456',
  'abcdef',
  'inyecta',
  'arrendamiento',
];

// ── Tipos ──────────────────────────────────────────────────────────
export interface PasswordContext {
  email?:     string;
  nombre?:    string;
  apellidos?: string;
}

export type PasswordViolation =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'MISSING_LOWER'
  | 'MISSING_UPPER'
  | 'MISSING_DIGIT'
  | 'MISSING_SYMBOL'
  | 'TRIVIAL_PATTERN'
  | 'CONTAINS_PERSONAL_DATA'
  | 'WHITESPACE_NOT_ALLOWED';

const VIOLATION_MESSAGES: Record<PasswordViolation, string> = {
  TOO_SHORT:               `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  TOO_LONG:                `La contraseña no debe exceder ${PASSWORD_MAX_LENGTH} caracteres`,
  MISSING_LOWER:           'Debe incluir al menos una letra minúscula',
  MISSING_UPPER:           'Debe incluir al menos una letra mayúscula',
  MISSING_DIGIT:           'Debe incluir al menos un dígito (0-9)',
  MISSING_SYMBOL:          'Debe incluir al menos un símbolo (ej. !@#$%&*?)',
  TRIVIAL_PATTERN:         'La contraseña contiene patrones obvios (password, qwerty, 123456…)',
  CONTAINS_PERSONAL_DATA:  'La contraseña no puede contener tu email, nombre o apellidos',
  WHITESPACE_NOT_ALLOWED:  'La contraseña no puede empezar ni terminar con espacios',
};

// ── Validación de fuerza ───────────────────────────────────────────

/**
 * validatePasswordStrength — devuelve un array de violaciones (vacío
 * si la contraseña es válida). El llamador puede usar este array
 * para mostrar TODOS los problemas a la vez al usuario en vez de
 * uno por uno (mejor UX).
 *
 * El parámetro `ctx` (opcional) contiene email/nombre/apellidos del
 * usuario para detectar contraseñas que los incluyan literalmente.
 */
export function validatePasswordStrength(
  password: string,
  ctx: PasswordContext = {},
): PasswordViolation[] {
  const violations: PasswordViolation[] = [];

  if (typeof password !== 'string') {
    return ['TOO_SHORT'];
  }

  // Longitud — chequeo antes que nada para no escupir 6 errores en una
  // contraseña de 3 caracteres.
  if (password.length < PASSWORD_MIN_LENGTH) violations.push('TOO_SHORT');
  if (password.length > PASSWORD_MAX_LENGTH) violations.push('TOO_LONG');

  // Espacios al borde — usualmente errores de copy/paste.
  if (password !== password.trim()) violations.push('WHITESPACE_NOT_ALLOWED');

  // Complejidad. Usamos las clases POSIX en regex para evitar pelearnos
  // con Unicode raros — para una password latinoamericana, ASCII está
  // bien; aceptamos acentos pero no los exigimos.
  if (!/[a-záéíóúñ]/.test(password))                 violations.push('MISSING_LOWER');
  if (!/[A-ZÁÉÍÓÚÑ]/.test(password))                 violations.push('MISSING_UPPER');
  if (!/[0-9]/.test(password))                        violations.push('MISSING_DIGIT');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    violations.push('MISSING_SYMBOL');
  }

  // Patrones triviales (case-insensitive substring).
  const lowered = password.toLowerCase();
  if (PATRONES_TRIVIALES.some((p) => lowered.includes(p))) {
    violations.push('TRIVIAL_PATTERN');
  }

  // Contenido personal: si parte del email/nombre/apellidos aparece
  // literalmente en la password, la rechazamos. Umbral 4 caracteres
  // para no rechazar passwords solo por contener "Ana" o "Eli".
  const personales: string[] = [];
  if (ctx.email) {
    const localPart = ctx.email.split('@')[0];
    if (localPart && localPart.length >= 4) personales.push(localPart);
  }
  if (ctx.nombre && ctx.nombre.length >= 4) personales.push(ctx.nombre);
  if (ctx.apellidos) {
    // Apellidos puede ser "Pérez García" — partir y revisar cada uno.
    for (const palabra of ctx.apellidos.split(/\s+/)) {
      if (palabra.length >= 4) personales.push(palabra);
    }
  }
  if (personales.some((p) => lowered.includes(p.toLowerCase()))) {
    violations.push('CONTAINS_PERSONAL_DATA');
  }

  return violations;
}

/**
 * Lanza AppError 400 con la primera violación si la contraseña no
 * pasa la política. El detail incluye TODAS las violaciones para que
 * la UI las muestre como checklist.
 */
export function assertPasswordStrong(
  password: string,
  ctx: PasswordContext = {},
): void {
  const violations = validatePasswordStrength(password, ctx);
  if (violations.length > 0) {
    throw new AppError(
      'WEAK_PASSWORD',
      VIOLATION_MESSAGES[violations[0]],
      400,
      { violations: violations.map((code) => ({ code, message: VIOLATION_MESSAGES[code] })) },
    );
  }
}

// ── Historial / no reuso ───────────────────────────────────────────

/**
 * assertNotReusedRecently — compara la contraseña en claro contra el
 * hash actual del usuario y los últimos N hashes en password_history.
 * Si coincide con cualquiera, lanza AppError 400 PASSWORD_REUSE.
 *
 * Usa bcrypt.compare para cada candidato — costoso por diseño (12
 * rondas × hasta 6 hashes = ~600ms), pero la operación se ejecuta
 * fuera del hot path (solo en cambios de password) así que está bien.
 */
export async function assertNotReusedRecently(
  userId: string,
  newPassword: string,
): Promise<void> {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  // El currentHash cuenta como "ya usada". Si la pass nueva == actual,
  // decimos PASSWORD_REUSE (no PASSWORD_UNCHANGED) para no dar pistas
  // sobre si el usuario "casi" acertó la actual.
  if (current && (await bcrypt.compare(newPassword, current.password))) {
    throw new AppError(
      'PASSWORD_REUSE',
      `No puedes reutilizar ninguna de tus últimas ${PASSWORD_HISTORY_DEPTH + 1} contraseñas`,
      400,
    );
  }

  const history = await prisma.passwordHistory.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    PASSWORD_HISTORY_DEPTH,
    select:  { hashedPassword: true },
  });

  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.hashedPassword)) {
      throw new AppError(
        'PASSWORD_REUSE',
        `No puedes reutilizar ninguna de tus últimas ${PASSWORD_HISTORY_DEPTH + 1} contraseñas`,
        400,
      );
    }
  }
}

// ── Hash + persist ─────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
}

export interface SetPasswordOptions {
  /**
   * Si true, marca mustChangePassword=true (uso típico: ADMIN reset).
   * Si false (default), lo pone en false (uso típico: change voluntario).
   */
  mustChange?: boolean;
  /**
   * Si true, escribe la contraseña actual al historial antes de pisarla.
   * Default true. Solo se desactiva en el bootstrap inicial cuando aún
   * no hay password "anterior" que conservar.
   */
  recordCurrentInHistory?: boolean;
}

/**
 * setPassword — operación canónica para escribir una nueva contraseña.
 *
 * Hace, en una sola transacción:
 *   1. Hashea la nueva password con bcrypt 12.
 *   2. (opt) Empuja la password ACTUAL del usuario al historial.
 *   3. Actualiza users.password + passwordChangedAt + mustChangePassword.
 *   4. Recorta el historial a PASSWORD_HISTORY_DEPTH entradas (borra
 *      las más viejas para que la tabla no crezca sin límite).
 *
 * NO valida fuerza ni reuso — el llamador debe haber corrido
 * assertPasswordStrong + assertNotReusedRecently antes. Mantener esta
 * función "tonta" simplifica los flujos donde el ADMIN podría querer
 * forzar una password débil temporal (no es nuestro caso, pero el
 * principio de single-responsibility lo justifica).
 */
export async function setPassword(
  userId: string,
  newPassword: string,
  opts: SetPasswordOptions = {},
): Promise<void> {
  const { mustChange = false, recordCurrentInHistory = true } = opts;

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, password: true },
  });
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
  }

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    // 1. Empujar password actual al historial (si procede).
    if (recordCurrentInHistory && user.password) {
      await tx.passwordHistory.create({
        data: { userId, hashedPassword: user.password },
      });
    }

    // 2. Actualizar la password "viva".
    await tx.user.update({
      where: { id: userId },
      data: {
        password:           newHash,
        passwordChangedAt:  new Date(),
        mustChangePassword: mustChange,
      },
    });

    // 3. Recortar historial. Mantenemos los últimos N; si hay más,
    //    borramos los excedentes (los más viejos).
    const total = await tx.passwordHistory.count({ where: { userId } });
    if (total > PASSWORD_HISTORY_DEPTH) {
      const excedentes = await tx.passwordHistory.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        skip:    PASSWORD_HISTORY_DEPTH,
        select:  { id: true },
      });
      if (excedentes.length > 0) {
        await tx.passwordHistory.deleteMany({
          where: { id: { in: excedentes.map((e) => e.id) } },
        });
      }
    }
  });
}

/**
 * Operación combinada (validación + reuso + persistencia) — el caso
 * más común. Atómica desde el punto de vista del llamador.
 */
export async function changePassword(
  userId: string,
  newPassword: string,
  ctx: PasswordContext = {},
  opts: SetPasswordOptions = {},
): Promise<void> {
  assertPasswordStrong(newPassword, ctx);
  await assertNotReusedRecently(userId, newPassword);
  await setPassword(userId, newPassword, opts);
}
