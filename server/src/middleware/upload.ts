/**
 * upload.ts — Middleware multer para subida de archivos.
 *
 * Política de archivos del expediente (clientes, contratos y
 * expediente por actor):
 *   - Tipos permitidos: pdf, jpg, jpeg, png, webp.
 *   - Tamaño máximo: 10 MB.
 *
 * Errores:
 *   - Tipo inválido        → AppError code=FILE_TYPE_INVALID, status=400
 *   - Tamaño excedido      → AppError code=FILE_TOO_LARGE,    status=400
 *   - No se recibió file   → AppError code=FILE_REQUIRED,     status=400
 *
 * El errorHandler global serializa estos AppError al formato estándar
 * `{ error: { code, message, details? } }`.
 */
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from './errorHandler';

const ROOT = path.resolve(__dirname, '..', '..', 'uploads');

// Asegura que existan los subdirectorios al iniciar el módulo.
['clientes', 'contratos', 'expedientes'].forEach(dir => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

export type UploadKind = 'clientes' | 'contratos' | 'expedientes';

// ─────────────────────────────────────────────────────────────────
// Tipos permitidos: pdf + imágenes comunes (jpg/jpeg/png/webp).
// Se valida por extensión y por mimetype para evitar uploads con
// extensión engañosa (.pdf con mimetype image/svg+xml, etc.).
// ─────────────────────────────────────────────────────────────────
const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'] as const;
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg', // algunos browsers lo mandan así
  'image/png',
  'image/webp',
]);

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function makeStorage(subdir: UploadKind) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(ROOT, subdir)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
      const stamp = Date.now();
      const rand = crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}_${rand}_${safe}${ext}`);
    },
  });
}

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as (typeof ALLOWED_EXTS)[number])) {
    return cb(new AppError(
      'FILE_TYPE_INVALID',
      `Tipo de archivo no permitido: ${ext}. Permitidos: ${ALLOWED_EXTS.join(', ')}`,
      400,
      { extension: ext, allowed: ALLOWED_EXTS },
    ));
  }
  // mimetype puede no venir o ser application/octet-stream según el cliente.
  // Solo rechazamos si vino y NO está en la whitelist.
  const mt = (file.mimetype || '').toLowerCase();
  if (mt && mt !== 'application/octet-stream' && !ALLOWED_MIMES.has(mt)) {
    return cb(new AppError(
      'FILE_TYPE_INVALID',
      `Mimetype no permitido: ${mt}`,
      400,
      { mimetype: mt, allowed: Array.from(ALLOWED_MIMES) },
    ));
  }
  cb(null, true);
};

const limits = { fileSize: MAX_FILE_BYTES };

const _uploadCliente = multer({
  storage: makeStorage('clientes'),
  fileFilter,
  limits,
}).single('archivo');

const _uploadContrato = multer({
  storage: makeStorage('contratos'),
  fileFilter,
  limits,
}).single('archivo');

// Expediente documental por contrato (actores + documentos).
// Se sirve bajo /uploads/expedientes/...
const _uploadExpediente = multer({
  storage: makeStorage('expedientes'),
  fileFilter,
  limits,
}).single('archivo');

// ─────────────────────────────────────────────────────────────────
// Wrapper que normaliza errores de multer a AppError, para que el
// errorHandler global los serialice al formato estándar.
//
// El `next` real se invoca solo cuando NO hay error → la ruta sigue
// adelante. Cuando hay error se llama `next(AppError)` y el siguiente
// middleware en el pipeline (errorHandler) lo atrapa.
// ─────────────────────────────────────────────────────────────────
function wrapMulter(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      // multer.MulterError tiene `code` con strings como LIMIT_FILE_SIZE
      const anyErr = err as { code?: string; message?: string; name?: string };
      if (err instanceof AppError) return next(err);
      if (anyErr?.name === 'MulterError' && anyErr.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(
          'FILE_TOO_LARGE',
          `Archivo demasiado grande. Máximo permitido: ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB`,
          400,
          { maxBytes: MAX_FILE_BYTES },
        ));
      }
      // Cualquier otro error de multer (e.g. LIMIT_UNEXPECTED_FILE).
      return next(new AppError(
        'UPLOAD_ERROR',
        anyErr?.message || 'Error al procesar el archivo subido',
        400,
      ));
    });
  };
}

export const uploadCliente: RequestHandler = wrapMulter(_uploadCliente);
export const uploadContrato: RequestHandler = wrapMulter(_uploadContrato);
export const uploadExpediente: RequestHandler = wrapMulter(_uploadExpediente);

export function publicUrl(filename: string, kind: UploadKind): string {
  return `/uploads/${kind}/${filename}`;
}

export function deleteIfExists(relativeUrl: string | null | undefined) {
  if (!relativeUrl) return;
  const safe = relativeUrl.replace(/^\/+/, '');
  if (!safe.startsWith('uploads/')) return;
  const full = path.resolve(__dirname, '..', '..', safe);
  if (fs.existsSync(full)) {
    try { fs.unlinkSync(full); } catch (_) { /* ignore */ }
  }
}
