/**
 * rateLimit.ts — Limitadores de tasa para endpoints sensibles.
 *
 * Usamos `express-rate-limit` con un store en memoria. Para producción
 * multi-réplica, conviene cambiar al store de Redis (basta inyectar un
 * `store: new RedisStore({...})` en cualquiera de los limitadores).
 *
 * Diseño:
 *   - `loginLimiter`: 5 intentos fallidos / 15 min / IP. No cuenta logins
 *     exitosos (`skipSuccessfulRequests: true`), así un usuario legítimo
 *     que se equivoca y luego acierta no quema cuota.
 *   - Las respuestas siguen el formato normalizado:
 *       { error: { code: 'RATE_LIMITED', message: '…', details: { retryAfter } } }
 *
 * Notas de seguridad:
 *   - La IP se toma de Express (`req.ip`). Si el server está detrás de un
 *     proxy/LB, hay que setear `app.set('trust proxy', 1)` para que `req.ip`
 *     refleje el header X-Forwarded-For. (Pendiente cuando se despliegue.)
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

// ───────────────────────────────────────────────────────────────────
// Login — defensa anti-fuerza-bruta
// ───────────────────────────────────────────────────────────────────
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,                   // 5 intentos fallidos
  standardHeaders: true,    // RateLimit-* headers (RFC draft)
  legacyHeaders: false,     // no X-RateLimit-* (deprecado)
  skipSuccessfulRequests: true, // logins OK no consumen cuota
  // Identificador: IP por defecto. Podríamos componerlo con email para
  // limitar por (IP, email), pero eso facilita user-enumeration leakeando
  // si el email existe → mejor solo IP.
  handler: (_req: Request, res: Response, _next, options) => {
    const retryAfterSec = Math.ceil(options.windowMs / 1000);
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.',
        details: { retryAfter: retryAfterSec },
      },
    });
  },
});

// ───────────────────────────────────────────────────────────────────
// API genérica — rate limit suave por IP (futuro)
// ───────────────────────────────────────────────────────────────────
// Reservado: si en algún momento queremos un techo global suave para todo
// /api, podríamos exportar y mountar:
//
//   export const apiLimiter = rateLimit({ windowMs: 60_000, max: 300, ... });
//
// Por ahora no se monta para no interferir con cargas masivas legítimas
// (ej. importación de Excel en /api/solicitudes/excel).
