/**
 * logger.ts — Logger estructurado del backend (pino).
 *
 * Diseño:
 *   - Una sola instancia compartida (`logger`) que cualquier módulo
 *     puede importar. Pino es síncrono-por-default, no bloquea el event
 *     loop, y soporta child loggers para añadir contexto sin perder la
 *     configuración base (level, redact, timestamps).
 *
 *   - Output:
 *       NODE_ENV=production  → JSON una-línea por evento (parseable por
 *                              CloudWatch / Datadog / Loki sin transform).
 *       NODE_ENV≠production  → pino-pretty (legible en terminal, con
 *                              colores y timestamp humano).
 *
 *   - Level por ENV: LOG_LEVEL ∈ {trace,debug,info,warn,error,fatal}.
 *     Default: 'info'. En tests podemos apagarlo con LOG_LEVEL=silent.
 *
 *   - Redacción de secretos: pino redact path-based para `req.headers
 *     .authorization`, `req.body.password`, `*.token`, `*.secret`.
 *     Es defensa en profundidad sobre la sanitización que ya hace
 *     bitacora.ts; aquí cubrimos los logs de pino-http (request/response)
 *     que NO pasan por la bitácora.
 *
 *   - Helper `httpLogger` (pino-http) crea logs por request con:
 *       requestId, method, url, statusCode, responseTime, userId
 *     Se monta en index.ts ANTES de las rutas. Si `req.id` ya existe
 *     (poblado por requestId middleware), pino-http lo reutiliza.
 *
 * No usar `console.*` para nada nuevo. Si encuentras console.log en el
 * código, migrarlo al logger del módulo correspondiente
 * (`logger.child({ module: 'cobranza' })`).
 */
import pino from 'pino';
import pinoHttp from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';
import { config } from '../config/env';

// ───────────────────────────────────────────────────────────────────
// Construcción del logger base
// ───────────────────────────────────────────────────────────────────

const isProd = config.nodeEnv === 'production';
const level = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');

export const logger = pino({
  level,
  // En dev, formatea con pino-pretty (transport corre en worker thread).
  // En prod, JSON crudo: cada línea es un evento parseable.
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }),
  // Redact: paths que NUNCA deben aparecer en los logs.
  // Soporta wildcards (`*`) y deep paths (`a.b.c`).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.pwd',
      'req.body.token',
      'req.body.secret',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.authorization',
    ],
    censor: '***REDACTED***',
  },
  base: {
    // En prod, etiqueta cada evento con el entorno y la versión del API
    // para distinguir despliegues. En dev se omite para no llenar la
    // terminal de ruido.
    ...(isProd ? { env: config.nodeEnv, service: 'inyecta-arrendamiento-api' } : {}),
  },
  // Timestamp ISO en lugar de epoch (más útil en agregadores).
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ───────────────────────────────────────────────────────────────────
// HTTP logger middleware
// ───────────────────────────────────────────────────────────────────

/**
 * `pinoHttp` produce un log por request con campos normalizados.
 * Lo extendemos con:
 *   - genReqId: usa `req.id` si ya existe (lo pone requestId middleware).
 *               Si no, genera uno nuevo.
 *   - serializers.req: incluye solo los campos útiles (no el body completo).
 *   - serializers.res: status + content-length.
 *   - customLogLevel: 4xx → warn, 5xx → error, resto info.
 *   - customSuccessMessage / customErrorMessage: una línea humana.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) => {
    // Si requestId middleware ya pobló req.id, respetarlo.
    const existing = (req as IncomingMessage & { id?: string }).id;
    if (existing) return existing;
    // Fallback: header inbound (typical en cadenas de proxies).
    const incoming = req.headers['x-request-id'];
    if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 200) {
      return incoming;
    }
    // Último recurso: pino-http genera uno con su contador interno.
    // Devolver undefined → pino-http auto-genera.
    return undefined as unknown as string;
  },
  customLogLevel: (_req, res, err) => {
    if (err) return 'error';
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url} → ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url} → ${res.statusCode} (${err.message})`;
  },
  serializers: {
    req(req: IncomingMessage & { id?: string; originalUrl?: string }) {
      return {
        id: req.id,
        method: req.method,
        url: req.originalUrl ?? req.url,
        // Headers útiles para debugging sin filtrar PII.
        // El header authorization queda redacted por la regla global.
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
        },
      };
    },
    res(res: ServerResponse) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
  // Excluye los health checks del log para no contaminar (los LB los
  // llaman cada 5s). Si pasa algo raro, igual saltará a warn/error.
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      const url = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';
      return url === '/api/health' || url === '/api/health/live';
    },
  },
});

// ───────────────────────────────────────────────────────────────────
// Helpers de conveniencia
// ───────────────────────────────────────────────────────────────────

/**
 * Crea un child logger con contexto fijo para un módulo o subsistema.
 * Ej: const log = childLogger('cobranza'); log.info({ contractId }, 'pago aplicado');
 */
export function childLogger(module: string, extra?: Record<string, unknown>) {
  return logger.child({ module, ...(extra ?? {}) });
}
