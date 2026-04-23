import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const ROOT = path.resolve(__dirname, '..', '..', 'uploads');

// Asegura que existan los subdirectorios al iniciar el módulo.
['clientes', 'contratos', 'expedientes'].forEach(dir => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

export type UploadKind = 'clientes' | 'contratos' | 'expedientes';

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
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.doc', '.docx', '.xls', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`Tipo de archivo no permitido: ${ext}`));
};

const limits = { fileSize: 15 * 1024 * 1024 }; // 15 MB

export const uploadCliente = multer({
  storage: makeStorage('clientes'),
  fileFilter,
  limits,
}).single('archivo');

export const uploadContrato = multer({
  storage: makeStorage('contratos'),
  fileFilter,
  limits,
}).single('archivo');

// Expediente documental por contrato (actores + documentos).
// Se sirve bajo /uploads/expedientes/...
export const uploadExpediente = multer({
  storage: makeStorage('expedientes'),
  fileFilter,
  limits,
}).single('archivo');

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
