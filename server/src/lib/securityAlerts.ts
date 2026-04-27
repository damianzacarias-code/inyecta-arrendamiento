/**
 * securityAlerts.ts — Alertas de seguridad en tiempo real
 * --------------------------------------------------------------
 * Detecta patrones sospechosos y notifica a ADMIN en cuanto
 * ocurren. Cubre §10 — Hardening de seguridad S3 (CLAUDE.md).
 *
 * Dispara una `notificarPorRol(['ADMIN'])` (campana + email
 * espejo) más un log estructurado a `pino`. NO bloquea el flujo
 * de negocio: si la notificación falla, solo queda en el log.
 *
 * Categorías de alerta:
 *   • LOGIN_FAILED              — un intento fallido individual
 *   • LOGIN_RATE_LIMITED        — IP llegó al máximo y se bloqueó
 *   • LOGIN_BURST               — N+ fallos en M segundos (sumando IPs)
 *   • PASSWORD_CHANGED          — usuario cambió su propia password
 *   • PASSWORD_RESET_BY_ADMIN   — ADMIN reseteó password de otro
 *   • USER_CREATED              — nuevo empleado dado de alta
 *   • USER_ROLE_CHANGED         — cambio de rol (con before/after)
 *   • USER_DEACTIVATED          — desactivación de usuario
 *   • USER_ACTIVATED            — reactivación de usuario
 *
 * Cooldown: cada categoría no se vuelve a disparar a un mismo
 * sujeto (IP/userId) en la misma ventana corta para no spamear
 * la campana. La ventana es por categoría (defaults seguros).
 */
import { childLogger } from './logger';
import { notificarPorRol } from './notificar';

const log = childLogger('securityAlerts');

// ── Categorías de alerta ───────────────────────────────────────────
export type AlertCategory =
  | 'LOGIN_FAILED'
  | 'LOGIN_RATE_LIMITED'
  | 'LOGIN_BURST'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_BY_ADMIN'
  | 'USER_CREATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'USER_ACTIVATED';

// Mapeo de categorías a títulos / nivel de impacto. Sirve para que
// la campana muestre algo legible y la UI pueda decidir el color.
const CATEGORY_META: Record<AlertCategory, { titulo: string; severidad: 'info' | 'warn' | 'crit' }> = {
  LOGIN_FAILED:            { titulo: 'Intento de login fallido',                severidad: 'info' },
  LOGIN_RATE_LIMITED:      { titulo: 'IP bloqueada por demasiados intentos',    severidad: 'warn' },
  LOGIN_BURST:             { titulo: 'Oleada de intentos de login fallidos',    severidad: 'crit' },
  PASSWORD_CHANGED:        { titulo: 'Contraseña cambiada por el usuario',      severidad: 'info' },
  PASSWORD_RESET_BY_ADMIN: { titulo: 'Contraseña reseteada por administrador',  severidad: 'warn' },
  USER_CREATED:            { titulo: 'Nuevo usuario creado',                    severidad: 'info' },
  USER_ROLE_CHANGED:       { titulo: 'Rol de usuario modificado',               severidad: 'warn' },
  USER_DEACTIVATED:        { titulo: 'Usuario desactivado',                     severidad: 'warn' },
  USER_ACTIVATED:          { titulo: 'Usuario reactivado',                      severidad: 'info' },
};

// ── Cooldown anti-spam ─────────────────────────────────────────────
//
// El propósito es no llenar la campana con 50 alertas iguales en 30
// segundos. Una vez que disparamos una alerta de categoría C para el
// sujeto S, ignoramos las siguientes durante COOLDOWN_MS[C].
//
// Excepción explícita: LOGIN_BURST tiene cooldown bajo (60s) porque
// es la señal más útil para reaccionar a un ataque activo y queremos
// avisar varias veces si la oleada continúa.

const COOLDOWN_MS: Record<AlertCategory, number> = {
  LOGIN_FAILED:            60_000,        // 1 min por IP — evita 5 alertas seguidas del bloqueo
  LOGIN_RATE_LIMITED:      300_000,       // 5 min por IP — solo 1 aviso de bloqueo en la ventana
  LOGIN_BURST:             60_000,        // 1 min global — re-alerta si la oleada persiste
  PASSWORD_CHANGED:        0,             // sin cooldown — cambios siempre auditan
  PASSWORD_RESET_BY_ADMIN: 0,
  USER_CREATED:            0,
  USER_ROLE_CHANGED:       0,
  USER_DEACTIVATED:        0,
  USER_ACTIVATED:          0,
};

// Map<"<categoria>:<sujeto>", expiraEnMs>
const cooldownState = new Map<string, number>();

function inCooldown(category: AlertCategory, subject: string): boolean {
  const window = COOLDOWN_MS[category];
  if (window <= 0) return false;
  const key = `${category}:${subject}`;
  const expiresAt = cooldownState.get(key);
  const now = Date.now();
  if (expiresAt && expiresAt > now) return true;
  cooldownState.set(key, now + window);
  // Limpieza oportunista — la corremos cada vez que insertamos para
  // que el Map no crezca sin límite. Es O(n) pero n nunca es grande
  // (alertas por categoría son acotadas).
  if (cooldownState.size > 200) {
    for (const [k, v] of cooldownState) {
      if (v <= now) cooldownState.delete(k);
    }
  }
  return false;
}

// ── Detector de oleadas (burst detector) ───────────────────────────
//
// Mantiene un buffer de timestamps de los últimos N intentos fallidos
// y dispara LOGIN_BURST cuando hay BURST_THRESHOLD eventos en
// BURST_WINDOW_MS. La idea es atrapar ataques de credential-stuffing
// que rotan IPs (cada IP individual no llega a 5 en su ventana de
// rate-limit, pero el agregado sí).
const BURST_WINDOW_MS  = 5 * 60_000; // 5 minutos
const BURST_THRESHOLD  = 20;          // 20+ fallos en la ventana
const burstBuffer: number[] = [];

function recordFailureForBurst(): { triggered: boolean; count: number } {
  const now = Date.now();
  burstBuffer.push(now);
  // Recorta los más viejos en O(n) — no usamos splice porque buffer
  // es FIFO y los viejos están al principio.
  while (burstBuffer.length > 0 && now - burstBuffer[0] > BURST_WINDOW_MS) {
    burstBuffer.shift();
  }
  return { triggered: burstBuffer.length >= BURST_THRESHOLD, count: burstBuffer.length };
}

// ── Helper interno: dispara la alerta ───────────────────────────────
async function dispatch(
  category: AlertCategory,
  mensaje: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { titulo, severidad } = CATEGORY_META[category];

  // Log estructurado para SIEM/grep — siempre pasa, incluso en cooldown
  // o en tests, porque es la fuente primaria. La notif in-app es UX.
  log.warn({ alert: category, severidad, ...meta }, mensaje);

  try {
    await notificarPorRol(['ADMIN'], {
      tipo:    `SECURITY_${category}`,
      titulo,
      mensaje,
      entidad: 'SECURITY',
      // url al visor de bitácora para que el ADMIN pueda investigar.
      url:     '/admin/bitacora',
    });
  } catch (err) {
    // notificarPorRol ya atrapa internamente, pero por si revierte
    // ese contrato en el futuro.
    log.error({ err, alert: category }, 'fallo al enviar alerta de seguridad');
  }
}

// ── API pública — un método por evento ─────────────────────────────

/**
 * onLoginFailed — un intento individual de login con credenciales
 * incorrectas. Dispara LOGIN_FAILED por IP (con cooldown) y alimenta
 * el detector de burst.
 */
export async function onLoginFailed(meta: { ip: string; emailIntentado?: string }): Promise<void> {
  const burst = recordFailureForBurst();
  if (burst.triggered && !inCooldown('LOGIN_BURST', 'global')) {
    await dispatch(
      'LOGIN_BURST',
      `Detectados ${burst.count} intentos de login fallidos en ${BURST_WINDOW_MS / 60_000} min.`,
      { ventanaMin: BURST_WINDOW_MS / 60_000, fallos: burst.count },
    );
  }
  if (!inCooldown('LOGIN_FAILED', meta.ip)) {
    await dispatch(
      'LOGIN_FAILED',
      `Intento de login fallido desde IP ${meta.ip}.`,
      { ip: meta.ip, emailIntentado: meta.emailIntentado },
    );
  }
}

/**
 * onLoginRateLimited — la IP llegó al límite del rateLimiter y fue
 * bloqueada. Indica fuerza bruta sostenida (≥5 fallos en 15min).
 */
export async function onLoginRateLimited(meta: { ip: string }): Promise<void> {
  if (inCooldown('LOGIN_RATE_LIMITED', meta.ip)) return;
  await dispatch(
    'LOGIN_RATE_LIMITED',
    `IP ${meta.ip} bloqueada por exceso de intentos de login.`,
    { ip: meta.ip },
  );
}

/**
 * onPasswordChanged — el usuario cambió su propia contraseña.
 */
export async function onPasswordChanged(meta: { userId: string; email: string }): Promise<void> {
  await dispatch(
    'PASSWORD_CHANGED',
    `${meta.email} cambió su contraseña.`,
    { userId: meta.userId, email: meta.email },
  );
}

/**
 * onPasswordResetByAdmin — un ADMIN reseteó la contraseña de OTRO
 * usuario. Auto-resets (ADMIN editando su propia cuenta) NO disparan
 * — son indistinguibles del PASSWORD_CHANGED voluntario.
 */
export async function onPasswordResetByAdmin(meta: {
  actorId: string;
  actorEmail: string;
  targetId: string;
  targetEmail: string;
}): Promise<void> {
  if (meta.actorId === meta.targetId) return;
  await dispatch(
    'PASSWORD_RESET_BY_ADMIN',
    `${meta.actorEmail} reseteó la contraseña de ${meta.targetEmail}.`,
    meta,
  );
}

/**
 * onUserCreated — nuevo empleado dado de alta vía /api/users.
 */
export async function onUserCreated(meta: {
  actorId: string;
  actorEmail: string;
  newUserId: string;
  newUserEmail: string;
  rol: string;
}): Promise<void> {
  await dispatch(
    'USER_CREATED',
    `${meta.actorEmail} creó al usuario ${meta.newUserEmail} con rol ${meta.rol}.`,
    meta,
  );
}

/**
 * onUserRoleChanged — cambio de rol. Solo dispara si actor != target
 * (auto-actualizar nombre/apellido NO genera alerta).
 */
export async function onUserRoleChanged(meta: {
  actorId: string;
  actorEmail: string;
  targetId: string;
  targetEmail: string;
  rolAnterior: string;
  rolNuevo: string;
}): Promise<void> {
  if (meta.rolAnterior === meta.rolNuevo) return;
  await dispatch(
    'USER_ROLE_CHANGED',
    `${meta.actorEmail} cambió el rol de ${meta.targetEmail}: ${meta.rolAnterior} → ${meta.rolNuevo}.`,
    meta,
  );
}

/**
 * onUserDeactivated / onUserActivated — toggle de activo. Solo
 * dispara con cambio efectivo.
 */
export async function onUserDeactivated(meta: {
  actorId: string;
  actorEmail: string;
  targetId: string;
  targetEmail: string;
}): Promise<void> {
  await dispatch(
    'USER_DEACTIVATED',
    `${meta.actorEmail} desactivó al usuario ${meta.targetEmail}.`,
    meta,
  );
}

export async function onUserActivated(meta: {
  actorId: string;
  actorEmail: string;
  targetId: string;
  targetEmail: string;
}): Promise<void> {
  await dispatch(
    'USER_ACTIVATED',
    `${meta.actorEmail} reactivó al usuario ${meta.targetEmail}.`,
    meta,
  );
}

// ── Helpers de testing ─────────────────────────────────────────────
/** Limpia el estado in-memory. Solo para tests. */
export function _resetSecurityAlertsState(): void {
  cooldownState.clear();
  burstBuffer.length = 0;
}

/** Para tests: snapshot del buffer de burst (no muta). */
export function _snapshotBurstBuffer(): number[] {
  return [...burstBuffer];
}
