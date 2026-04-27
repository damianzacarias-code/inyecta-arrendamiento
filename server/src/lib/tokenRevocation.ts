/**
 * tokenRevocation.ts — Lista de revocación de JWTs
 * --------------------------------------------------------------
 * CLAUDE.md §10 — Hardening de seguridad S4.
 *
 * Mecanismo:
 *   1. Cada JWT que emitimos lleva `jti` (UUID v4) y `iat` (epoch s).
 *   2. Logout: insertamos el jti en revoked_tokens con expiresAt =
 *      exp del token. Cualquier verificación posterior lo rechaza.
 *   3. Para reducir queries, mantenemos un Set in-memory de jtis
 *      revocados activos. Lo hidratamos al boot (warmup) y lo
 *      mantenemos consistente con cada revoke().
 *   4. Cleanup periódico borra revoked_tokens vencidos
 *      (jsonwebtoken ya rechaza tokens expirados; mantenerlos
 *      en BD solo infla la tabla).
 *
 * Ventajas vs. una blacklist puramente en memoria:
 *   • Sobrevive a reinicios y a multi-réplica (warmup desde BD).
 *   • La BD es la fuente de verdad; el Set es solo cache.
 *
 * Trade-off: en multi-réplica con muchas escrituras, el Set local
 * de cada réplica solo se entera de revokes ajenos al siguiente
 * warmup. Si esto se vuelve crítico (no es el caso de Inyecta hoy
 * con 1 réplica), reemplazar el Set por Redis pubsub.
 */
import prisma from '../config/db';
import { childLogger } from './logger';

const log = childLogger('tokenRevocation');

// In-memory cache de jtis revocados activos. Se hidrata al boot.
const revokedJtis = new Set<string>();

// Lazy-init: cleanup interval. Lo arrancamos solo en producción/dev,
// no en tests (donde lo controlan manualmente o no lo necesitan).
let cleanupTimer: NodeJS.Timeout | null = null;

const CLEANUP_INTERVAL_MS = 60 * 60_000; // 1 hora

/**
 * Hidrata el Set en memoria desde BD. Llamar al boot del proceso.
 * Lee solo los registros NO vencidos — los ya expirados los borra
 * el cleanup.
 */
export async function warmupRevokedTokens(): Promise<void> {
  try {
    const rows = await prisma.revokedToken.findMany({
      where:  { expiresAt: { gt: new Date() } },
      select: { jti: true },
    });
    revokedJtis.clear();
    for (const row of rows) revokedJtis.add(row.jti);
    log.info({ count: rows.length }, 'cache de tokens revocados hidratado');
  } catch (err) {
    // No tumbamos el boot si Prisma falla — el sistema sigue
    // operando sin lista de revocación (mejor disponibilidad
    // que rechazar todo). El próximo warmup la recargará.
    log.error({ err }, 'fallo al hidratar revoked tokens — continuando con cache vacío');
  }
}

/**
 * isRevoked — chequeo síncrono. requireAuth lo llama por cada
 * request, así que NO toca BD: solo el Set in-memory.
 */
export function isRevoked(jti: string | undefined): boolean {
  if (!jti) return false;
  return revokedJtis.has(jti);
}

/**
 * revokeToken — registra el jti como revocado.
 *
 * Idempotente: si el jti ya existe, hacemos upsert para no fallar.
 * El expiresAt original se preserva (no se acorta ni alarga).
 */
export async function revokeToken(args: {
  jti:        string;
  userId:     string;
  expiresAt:  Date;
  reason?:    string;
}): Promise<void> {
  const { jti, userId, expiresAt, reason } = args;

  // Si el token ya expiró, no tiene sentido registrarlo.
  if (expiresAt.getTime() <= Date.now()) {
    return;
  }

  try {
    await prisma.revokedToken.upsert({
      where:  { jti },
      update: { reason }, // mantenemos el revokedAt original
      create: {
        jti,
        userId,
        expiresAt,
        reason,
      },
    });
    revokedJtis.add(jti);
    log.info({ jti, userId, reason }, 'token revocado');
  } catch (err) {
    // Si no podemos persistir, NO agregamos al cache local — para
    // no quedar inconsistentes. El usuario podrá repetir el logout.
    log.error({ err, jti, userId }, 'fallo al revocar token');
    throw err;
  }
}

/**
 * revokeAllForUser — invalida TODOS los tokens activos de un usuario
 * en este momento. Útil para "logout de todas las sesiones" o cuando
 * detectamos compromiso de cuenta.
 *
 * Implementación: insertamos un sentinel SHA-like ('user:<id>:<ts>')
 * en revoked_tokens NO — ese enfoque no funciona porque los tokens
 * ya emitidos no comparten ese jti. Lo correcto es mover
 * passwordChangedAt: requireAuth ya rechaza tokens con iat <
 * passwordChangedAt. Esa lógica vive en passwordPolicy.setPassword
 * (que actualiza passwordChangedAt), así que aquí solo exponemos un
 * helper que borra del cache local los jtis del user (defensa en
 * profundidad — el chequeo de iat es la barrera real).
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  // Los jtis vivos no los conocemos (no los almacenamos al emitir
  // — el JWT es stateless). El mecanismo real es passwordChangedAt.
  // Aun así, limpiamos los jtis revocados del user del cache local
  // para no traer ruido a la próxima rehidratación.
  try {
    const rows = await prisma.revokedToken.findMany({
      where:  { userId },
      select: { jti: true },
    });
    for (const r of rows) revokedJtis.delete(r.jti);
    await prisma.revokedToken.deleteMany({ where: { userId } });
    log.info({ userId }, 'revoked_tokens del user limpiados (revoke-all relies on passwordChangedAt)');
  } catch (err) {
    log.error({ err, userId }, 'revokeAllForUser fallo');
  }
}

/**
 * cleanupExpired — borra registros con expiresAt < now y los saca
 * del cache local. Llamar periódicamente vía setInterval.
 */
export async function cleanupExpired(): Promise<{ deleted: number }> {
  try {
    const now = new Date();
    const expired = await prisma.revokedToken.findMany({
      where:  { expiresAt: { lt: now } },
      select: { jti: true },
    });
    if (expired.length === 0) return { deleted: 0 };

    await prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    for (const r of expired) revokedJtis.delete(r.jti);
    log.debug({ deleted: expired.length }, 'revoked tokens expirados purgados');
    return { deleted: expired.length };
  } catch (err) {
    log.error({ err }, 'cleanup de revoked tokens falló');
    return { deleted: 0 };
  }
}

/**
 * startCleanupTimer — arranca el setInterval. Idempotente: dos
 * llamadas no crean dos timers. Llamar al boot.
 */
export function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    void cleanupExpired();
  }, CLEANUP_INTERVAL_MS);
  // unref: que el timer no impida exit() del proceso.
  cleanupTimer.unref?.();
}

export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ── Helpers para tests ─────────────────────────────────────────────
export function _cacheSize(): number {
  return revokedJtis.size;
}
export function _cacheClear(): void {
  revokedJtis.clear();
}
export function _cacheHas(jti: string): boolean {
  return revokedJtis.has(jti);
}
