/**
 * Bitácora de auditoría — cumplimiento PLD para SOFOM
 * ---------------------------------------------------------------
 * Registra TODAS las operaciones de escritura (POST, PATCH, PUT,
 * DELETE) realizadas por usuarios autenticados:
 *
 *   • Quién (usuarioId, email, rol — snapshot al momento del evento)
 *   • Qué  (método, ruta, entidad inferida del path, payload sanitizado)
 *   • Cuándo (createdAt server-side, no del cliente)
 *   • Desde dónde (IP + userAgent)
 *   • Resultado (status HTTP de la respuesta)
 *
 * Diseño:
 *   - El middleware se monta DESPUÉS de express.json() y de requireAuth.
 *   - No bloquea la respuesta: la inserción en BD es fire-and-forget
 *     (solo loggea errores). Esto evita que un fallo de bitácora
 *     tumbe una operación de negocio.
 *   - Sanitiza secretos (password, token, secret, authorization).
 *   - GET y OPTIONS quedan fuera por defecto para no inflar la tabla;
 *     activar via env BITACORA_LOG_GETS=true si se requiere.
 *
 * Uso:
 *   app.use('/api', bitacora());            // mount global
 *   o por ruta: router.post('/x', bitacora({ entidad: 'X', accion: 'CREATE_X' }), handler)
 */
import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { config } from '../config/env';
import { childLogger } from '../lib/logger';

const log = childLogger('bitacora');

// ───────────────────────────────────────────────────────────────────
// Sanitización de payloads
// ───────────────────────────────────────────────────────────────────

const SECRET_KEYS = new Set([
  'password',
  'pwd',
  'pass',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'creditCard',
  'cardNumber',
  'cvv',
]);

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.has(k.toLowerCase())) {
        out[k] = '***REDACTED***';
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

// ───────────────────────────────────────────────────────────────────
// Inferencia de entidad e id desde la ruta
// /api/contracts/abc123  →  { entidad: 'Contract', entidadId: 'abc123' }
// /api/contracts         →  { entidad: 'Contract' }
// ───────────────────────────────────────────────────────────────────

const ENTITY_MAP: Record<string, string> = {
  contracts: 'Contract',
  clients: 'Client',
  quotations: 'Quotation',
  cobranza: 'Payment',
  payments: 'Payment',
  insurance: 'InsurancePolicy',
  gps: 'GPSDevice',
  documents: 'Document',
  invoices: 'Invoice',
  'circulo-credito': 'CirculoCredito',
  conciliation: 'BankReconciliation',
  portal: 'Portal',
  auth: 'Auth',
};

function inferEntity(ruta: string): { entidad?: string; entidadId?: string } {
  // /api/<resource>[/<id>][/...]
  const parts = ruta.replace(/^\/api\//, '').split('/').filter(Boolean);
  if (parts.length === 0) return {};
  const entidad = ENTITY_MAP[parts[0]] ?? parts[0];
  const entidadId =
    parts.length >= 2 && /^[a-zA-Z0-9_-]{6,}$/.test(parts[1]) ? parts[1] : undefined;
  return { entidad, entidadId };
}

// ───────────────────────────────────────────────────────────────────
// Inferencia de acción desde método + ruta
// ───────────────────────────────────────────────────────────────────

function inferAccion(metodo: string, ruta: string, override?: string): string {
  if (override) return override;
  const ult = ruta.split('/').filter(Boolean).pop() ?? '';
  switch (metodo) {
    case 'POST':
      return ult.match(/^[a-zA-Z0-9_-]{6,}$/) ? 'UPDATE' : 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return metodo;
  }
}

// ───────────────────────────────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────────────────────────────

export interface BitacoraOptions {
  /** Si se especifica, sobreescribe la inferencia automática de entidad. */
  entidad?: string;
  /** Si se especifica, sobreescribe la inferencia automática de acción. */
  accion?: string;
  /** Si true, también loggea GET (default: false). */
  logReads?: boolean;
}

const LOG_GETS = config.bitacoraLogGets;

export function bitacora(opts: BitacoraOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const metodo = req.method.toUpperCase();
    const esEscritura = metodo === 'POST' || metodo === 'PATCH' || metodo === 'PUT' || metodo === 'DELETE';

    // Saltar si no es escritura y no se pidió explícitamente loggear lecturas
    if (!esEscritura && !opts.logReads && !LOG_GETS) {
      return next();
    }
    if (metodo === 'OPTIONS') return next();

    // Capturar status final
    const tStart = Date.now();
    res.on('finish', () => {
      // No bloquear el ciclo de respuesta — fire and forget
      void registrar(req, res, opts).catch((e) => {
        log.error({ err: e }, '[bitacora] error registrando evento');
      });
      void tStart; // se podría loggear duración si se requiere
    });

    next();
  };
}

async function registrar(req: Request, res: Response, opts: BitacoraOptions) {
  const ruta = req.originalUrl.split('?')[0];
  const { entidad: entInf, entidadId } = inferEntity(ruta);
  const entidad = opts.entidad ?? entInf;
  const accion = inferAccion(req.method.toUpperCase(), ruta, opts.accion);

  // Saneamos el payload (body) para no persistir secretos
  const payloadJson =
    req.body && Object.keys(req.body).length > 0 ? (sanitize(req.body) as object) : undefined;

  // Algunos extractores de IP comunes (Express con trust proxy)
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined;

  await prisma.bitacora.create({
    data: {
      // pino-http amplía Request.id como string|number; nosotros guardamos string.
      requestId: req.id != null ? String(req.id) : null,
      usuarioId: req.user?.userId ?? null,
      usuarioEmail: req.user?.email ?? null,
      usuarioRol: req.user?.rol ?? null,
      metodo: req.method.toUpperCase(),
      ruta,
      entidad: entidad ?? null,
      entidadId: entidadId ?? null,
      accion,
      payloadJson: payloadJson ?? undefined,
      responseStatus: res.statusCode,
      ip: ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    },
  });
}
