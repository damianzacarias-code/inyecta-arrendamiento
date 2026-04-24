/**
 * extract.ts — Endpoint POST /api/extract
 *
 * Recibe un archivo (PDF o imagen) y un `tipo` y devuelve los datos
 * estructurados extraídos por el provider configurado (MOCK o CLAUDE).
 *
 * Request:
 *   multipart/form-data:
 *     archivo: File   (PDF, JPG, PNG, WEBP — max 10MB)
 *     tipo:    string ('CSF' | 'INE' | 'COMPROBANTE_DOMICILIO' | 'FACTURA_BIEN' | 'ACTA_CONSTITUTIVA' | 'SOLICITUD')
 *
 * Response 200:
 *   {
 *     ok: true,
 *     provider: 'MOCK' | 'CLAUDE',
 *     confidence: number,             // 0..1
 *     data: { ... },                  // shape definida en schemas.ts según tipo
 *     warning?: string                // presente si MOCK o confidence<0.5
 *   }
 *
 * Errores:
 *   400 INVALID_TIPO          — tipo no es uno de los soportados.
 *   400 FILE_REQUIRED         — no se recibió archivo.
 *   400 FILE_TYPE_INVALID     — tipo de archivo no permitido (delegado a multer).
 *   400 FILE_TOO_LARGE        — archivo > 10MB (delegado a multer).
 *   502 EXTRACT_PROVIDER_ERROR— el provider tiró un error (red, key, etc.).
 *   503 EXTRACT_DISABLED      — EXTRACT_PROVIDER=CLAUDE sin ANTHROPIC_API_KEY.
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { childLogger } from '../lib/logger';
import { TIPOS_EXTRACT, getExtractProvider } from '../services/pdfExtract';
import type { TipoExtract } from '../services/pdfExtract';

const log = childLogger('extract');
const router = Router();

// Multer en memoria (no escribe a disco — el archivo solo se procesa).
const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const MAX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return cb(new AppError(
        'FILE_TYPE_INVALID',
        `Tipo de archivo no permitido: ${ext}. Permitidos: ${ALLOWED_EXTS.join(', ')}`,
        400,
      ));
    }
    const mt = (file.mimetype || '').toLowerCase();
    if (mt && mt !== 'application/octet-stream' && !ALLOWED_MIMES.has(mt)) {
      return cb(new AppError(
        'FILE_TYPE_INVALID',
        `Mimetype no permitido: ${mt}`,
        400,
      ));
    }
    cb(null, true);
  },
}).single('archivo');

/** Wrapper que normaliza errores de multer a AppError. */
function uploadAndNormalize(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof AppError) return next(err);
    const anyErr = err as { code?: string; message?: string; name?: string };
    if (anyErr?.name === 'MulterError' && anyErr.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(
        'FILE_TOO_LARGE',
        `Archivo demasiado grande. Máximo: ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`,
        400,
      ));
    }
    return next(new AppError('UPLOAD_ERROR', anyErr?.message || 'Error al procesar archivo', 400));
  });
}

router.post('/', requireAuth, uploadAndNormalize, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tipoRaw = (req.body?.tipo || '').toString().trim().toUpperCase();
    if (!TIPOS_EXTRACT.includes(tipoRaw as TipoExtract)) {
      throw new AppError(
        'INVALID_TIPO',
        `Tipo no soportado: ${tipoRaw || '(vacío)'}. Permitidos: ${TIPOS_EXTRACT.join(', ')}`,
        400,
        { allowed: TIPOS_EXTRACT },
      );
    }
    const tipo = tipoRaw as TipoExtract;

    if (!req.file) {
      throw new AppError('FILE_REQUIRED', 'No se recibió archivo', 400);
    }

    let provider;
    try {
      provider = getExtractProvider();
    } catch (err) {
      // EXTRACT_PROVIDER=CLAUDE pero falta key → 503 EXTRACT_DISABLED.
      throw new AppError(
        'EXTRACT_DISABLED',
        err instanceof Error ? err.message : String(err),
        503,
      );
    }

    const result = await provider.extract(req.file.buffer, req.file.mimetype, tipo);

    if (!result.ok) {
      log.warn({ tipo, provider: result.provider, error: result.error }, 'extract failed');
      throw new AppError(
        'EXTRACT_PROVIDER_ERROR',
        result.error || 'El provider no pudo extraer los datos',
        502,
        { provider: result.provider, raw: result.raw },
      );
    }

    const warnings: string[] = [];
    if (result.provider === 'MOCK') {
      warnings.push('Datos provienen del provider MOCK (no es producción real). Verifica los campos extraídos.');
    }
    if (result.confidence < 0.5) {
      warnings.push(`Confianza baja (${result.confidence.toFixed(2)}). Verifica los campos extraídos.`);
    }

    log.info({ tipo, provider: result.provider, confidence: result.confidence, fields: Object.keys(result.data).length }, 'extract success');

    return res.json({
      ok: true,
      provider: result.provider,
      confidence: result.confidence,
      data: result.data,
      ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
