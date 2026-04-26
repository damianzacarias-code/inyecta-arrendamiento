import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config/env';
import prisma from './config/db';
import authRoutes from './routes/auth';
import catalogRoutes from './routes/catalogs';
import quotationRoutes from './routes/quotations';
import clientRoutes from './routes/clients';
import contractRoutes from './routes/contracts';
import cobranzaRoutes from './routes/cobranza';
import insuranceRoutes from './routes/insurance';
import gpsRoutes from './routes/gps';
import circuloCreditoRoutes from './routes/circuloCredito';
import reportsRoutes from './routes/reports';
import invoicesRoutes from './routes/invoices';
import portalRoutes from './routes/portal';
import conciliationRoutes from './routes/conciliation';
import searchRoutes from './routes/search';
import alertsRoutes from './routes/alerts';
import bitacoraRoutes from './routes/bitacora';
import notificacionesRoutes from './routes/notificaciones';
import expedienteRoutes from './routes/expediente';
import { templateRouter as solicitudCnbvTemplateRoutes, contractRouter as solicitudCnbvContractRoutes } from './routes/solicitudCnbv';
import extractRoutes from './routes/extract';
import brandingRoutes from './routes/branding';
import { bitacora } from './middleware/bitacora';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { logger, httpLogger } from './lib/logger';
import { installShutdown } from './lib/shutdown';

const app = express();

// ─────────────────────────────────────────────────────────────────
// Trust proxy: necesario para que `req.ip` y X-Forwarded-For
// reflejen al cliente real cuando estamos detrás de un LB / nginx.
// `1` = confía en el primer hop (típico setup de un solo proxy).
// ─────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────────
// Request ID — UUID por request para correlación de logs.
// Debe ir ANTES de pino-http (para que el logger lo recoja) y ANTES
// de la bitácora (para que se persista junto a la entrada).
// ─────────────────────────────────────────────────────────────────
app.use(requestId());

// ─────────────────────────────────────────────────────────────────
// HTTP logger — pino-http registra una línea por request con
// { reqId, method, url, statusCode, responseTime }. Ignora /api/health*.
// ─────────────────────────────────────────────────────────────────
app.use(httpLogger);

// ─────────────────────────────────────────────────────────────────
// Helmet — security headers (HSTS, X-Frame-Options, X-Content-Type, etc.)
// ─────────────────────────────────────────────────────────────────
// Customizaciones:
//   - contentSecurityPolicy:false → somos API, no renderizamos HTML.
//     CSP es responsabilidad del frontend (Vite).
//   - crossOriginResourcePolicy:'cross-origin' → permite que el frontend
//     en otro origen consuma assets de /uploads (PDFs, imágenes).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ─────────────────────────────────────────────────────────────────
// CORS — whitelist por ENV (CORS_ALLOWED_ORIGINS, separados por coma).
// En development sin var → permite localhost:5173 y :3000 por default.
// ─────────────────────────────────────────────────────────────────
const corsOriginsEnv = config.cors.allowedOrigins;
const corsOrigins =
  corsOriginsEnv && corsOriginsEnv.trim().length > 0
    ? corsOriginsEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : config.nodeEnv === 'development'
      ? ['http://localhost:5173', 'http://localhost:3000']
      : []; // en prod sin whitelist → bloquea todo (failsafe)

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite requests sin Origin (curl, Postman, server-to-server)
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      // Origen no autorizado: NO lanzamos error (eso devolvería 500).
      // Simplemente omitimos los headers CORS — el browser bloqueará.
      logger.warn({ origin }, '[cors] origen rechazado');
      return cb(null, false);
    },
    credentials: true,
  }),
);

// ─────────────────────────────────────────────────────────────────
// Body parsers — límites razonables.
// 1mb cubre cualquier payload JSON legítimo del sistema. Las cargas
// de archivos pesados (PDFs, comprobantes) NO pasan por aquí — usan
// multer (`middleware/upload.ts`, `routes/conciliation.ts`).
// ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir archivos subidos (PDFs, imágenes de documentos)
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// ─────────────────────────────────────────────────────────────────
// Health check con DB ping
// ─────────────────────────────────────────────────────────────────
// GET /api/health           → liveness + DB connectivity
// GET /api/health/live      → liveness puro (no toca DB) — para k8s livenessProbe
//
// Comportamiento:
//   - OK (200):       proceso vivo y Prisma respondió a SELECT 1
//   - DEGRADED (503): proceso vivo pero la DB no respondió o tardó >3s
//
// Nota: el endpoint queda fuera de auth y fuera de bitácora (no inflar la
// tabla). Devuelve solo metadata operativa, sin secrets.
app.get('/api/health/live', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    // Timeout defensivo: si Prisma se cuelga, no queremos un health check
    // colgado para siempre. 3s es suficiente para una query trivial local.
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('DB ping timeout (>3000ms)')), 3000),
      ),
    ]);
    const latencyMs = Date.now() - startedAt;
    res.json({
      status: 'ok',
      db: { status: 'ok', latencyMs },
      uptime: process.uptime(),
      env: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    // 503 — el LB / k8s lo interpretarán como "no me mandes tráfico".
    res.status(503).json({
      status: 'degraded',
      db: { status: 'fail', latencyMs, error: message },
      uptime: process.uptime(),
      env: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  }
});

// Bitácora de auditoría (PLD) — registra todas las escrituras debajo de /api.
// Se monta ANTES de las rutas para enganchar res.on('finish') de cada request;
// el req.user ya estará poblado por requireAuth dentro de cada router.
app.use('/api', bitacora());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/cobranza', cobranzaRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/circulo-credito', circuloCreditoRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/conciliation', conciliationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
// Solicitud CNBV — template (admin) y generador por contrato.
//   POST/GET/DELETE  /api/templates/solicitud-cnbv
//   GET              /api/contracts/:id/solicitud-cnbv (montado bajo el prefijo de contracts)
app.use('/api/templates/solicitud-cnbv', solicitudCnbvTemplateRoutes);
app.use('/api/contracts', solicitudCnbvContractRoutes);
// expedienteRoutes monta endpoints con distintos prefijos:
//   GET/POST  /api/contracts/:id/expediente[/...]
//   PATCH/DEL /api/expediente/actores/:actorId
//   POST      /api/expediente/actores/:actorId/documentos
//   PATCH/DEL /api/expediente/documentos/:docId
// Por eso se monta en /api.
app.use('/api', expedienteRoutes);
// Extracción automática de PDFs con Claude Vision (o MOCK si no hay API key).
// POST /api/extract { kind, fileUrl } → { fields: {...}, provider: 'claude'|'mock' }
app.use('/api/extract', extractRoutes);
// Branding público (sin auth) — datos del emisor que el cliente embebe en
// PDFs y muestra en el portal del arrendatario. GET /api/config/branding.
app.use('/api/config', brandingRoutes);

// 404 para /api/* sin match — devuelve el mismo formato { error: {...} }
app.use('/api', notFoundHandler);

// Error handler central — DEBE ir al final (4 args: err, req, res, next)
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────
// Start + graceful shutdown
// ─────────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    `🏢 Inyecta Arrendamiento API escuchando en :${config.port}`,
  );
});

// SIGTERM / SIGINT → cierra HTTP server primero (drena requests en
// vuelo, deja de aceptar nuevos), después libera Prisma. Si algo se
// cuelga, hard-kill a los 10s para no quedarnos atorados en producción.
installShutdown(server, prisma);

export default app;
