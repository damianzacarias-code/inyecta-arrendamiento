/**
 * encryptedStatic.ts — Reemplazo de express.static('/uploads') que
 * sirve transparentemente archivos cifrados (S6) y plaintext legacy.
 *
 * Reglas de resolución (resolveServingPath):
 *   1. Existe `<path>.enc` → descifra al vuelo, stream del plaintext.
 *   2. Existe `<path>` plaintext → stream directo (legacy / S6 off).
 *   3. Nada → next() (deja que pase al notFoundHandler de express).
 *
 * Seguridad:
 *   - path traversal: rechazamos cualquier path que tras normalizar
 *     escape de la raíz (defense-in-depth, express ya lo valida pero
 *     re-validamos por si futuras refactors lo rompen).
 *   - El handler NO cachea — cada request descifra. Para los volúmenes
 *     de Inyecta (decenas de PDFs/min) AES-GCM es despreciable
 *     (~500 MB/s en hardware moderno → un 5MB PDF se descifra en 10ms).
 */
import path from 'path';
import { promises as fs } from 'fs';
import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { resolveServingPath, decryptToStream } from '../lib/uploadCipher';
import { childLogger } from '../lib/logger';

const log = childLogger('encrypted-static');

// MIME mapping mínimo — los formatos que upload.ts permite.
const MIME_BY_EXT: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

export function encryptedStatic(rootDir: string): RequestHandler {
  // Fallback a express.static para archivos plaintext (preserva
  // comportamiento previo: ETag, Last-Modified, range requests).
  // Solo lo usamos en la rama "no encriptado".
  const staticHandler = express.static(rootDir, { fallthrough: true });

  return async (req: Request, res: Response, next: NextFunction) => {
    // req.path llega ya sin el prefijo /uploads (lo quita Express
    // porque app.use('/uploads', ...) hace strip del mount path).
    // Normalizamos para defenderse de path traversal.
    const reqPath = decodeURIComponent(req.path);
    const safe = path.normalize(reqPath).replace(/^[\\/]+/, '');
    const absPath = path.join(rootDir, safe);
    if (!absPath.startsWith(rootDir + path.sep) && absPath !== rootDir) {
      log.warn({ reqPath, absPath }, 'path traversal rechazado');
      return res.status(403).json({ error: 'Forbidden' });
    }

    let resolved;
    try {
      resolved = await resolveServingPath(absPath);
    } catch (err) {
      log.error({ err, absPath }, 'error resolviendo path');
      return next();
    }
    if (!resolved) {
      // 404 — caemos al express.static que también va a 404.
      return staticHandler(req, res, next);
    }

    if (!resolved.encrypted) {
      // Plaintext legacy o S6 deshabilitado — express.static maneja
      // ETag/range/Last-Modified por nosotros.
      return staticHandler(req, res, next);
    }

    // Cifrado — descifrar al vuelo y streamear.
    try {
      const stream = await decryptToStream(resolved.path);
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'private, no-store');
      // No exponemos Content-Length (no lo conocemos sin descifrar
      // dos veces). Para PDFs / imágenes el browser maneja sin
      // Content-Length sin problema.
      stream.on('error', (err) => {
        log.error({ err, file: resolved.path }, 'stream error');
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    } catch (err) {
      // El descifrado falló (tampering, corrupción, master key
      // incorrecta). Nunca devolvemos el contenido raw.
      log.error({ err, file: resolved.path }, 'descifrado falló');
      if (!res.headersSent) res.status(500).json({ error: 'Error sirviendo archivo' });
    }
  };
}

// Export auxiliar para tests.
export { resolveServingPath, decryptToStream };
// Re-export de fs para mantener una superficie de tests reducida.
export { fs as _fs };
