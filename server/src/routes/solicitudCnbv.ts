// solicitudCnbv.ts
// ────────────────────────────────────────────────────────────────────
// Rutas para el módulo "Solicitud de Crédito CNBV":
//
//   POST   /api/templates/solicitud-cnbv          (admin/director) — sube el template editable
//   GET    /api/templates/solicitud-cnbv/status   (auth)            — estado del template
//   DELETE /api/templates/solicitud-cnbv          (admin/director) — borra el template
//   GET    /api/contracts/:id/solicitud-cnbv      (auth)            — genera el PDF llenado
//                                                                     ?download=1 fuerza attachment
//
// Notas:
//   - El template es UN solo archivo compartido (no por cliente). Se
//     guarda en `server/data/templates/solicitud-cnbv.pdf`. Si se sube
//     uno nuevo, sobrescribe al anterior (el anterior NO se versiona).
//   - El PDF generado se devuelve sin flatten para que el usuario pueda
//     revisar y corregir antes de imprimirlo / firmarlo.
//   - La validación del template comprueba que sea un PDF con AcroForm
//     (al menos 1 form field), para evitar subir un PDF de texto plano
//     que luego no llenaría nada.

import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { childLogger } from '../lib/logger';
import {
  TEMPLATE_DIR,
  TEMPLATE_PATH,
  templateExists,
  templateStats,
  fillSolicitudCnbv,
} from '../services/solicitudCnbvFiller';
import prisma from '../config/db';

const log = childLogger('solicitud-cnbv');

// ────────────────────────────────────────────────────────────────────
// Multer en memoria (validamos el contenido antes de tocar disco)
// ────────────────────────────────────────────────────────────────────
const uploadTemplate = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' && file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se admiten archivos PDF (.pdf)'));
    }
    cb(null, true);
  },
}).single('archivo');

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function ensureTemplateDir() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  }
}

/** Valida que el buffer sea un PDF con AcroForm; retorna # de fields. */
async function validatePdfTemplate(buf: Buffer): Promise<number> {
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(buf);
  } catch (err) {
    throw new AppError(
      'INVALID_PDF',
      'El archivo no parece ser un PDF válido',
      400,
      { detail: err instanceof Error ? err.message : String(err) },
    );
  }
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  if (fields.length === 0) {
    throw new AppError(
      'PDF_HAS_NO_FORM',
      'El PDF subido no tiene campos de formulario (AcroForm). Sube la versión editable de la solicitud.',
      400,
    );
  }
  return fields.length;
}

// ────────────────────────────────────────────────────────────────────
// Routers
//
// Devolvemos DOS routers porque los endpoints viven bajo prefijos
// distintos:
//   - templateRouter → se monta en  /api/templates/solicitud-cnbv
//   - contractRouter → se monta en  /api/contracts (handler para :id/solicitud-cnbv)
// ────────────────────────────────────────────────────────────────────

export const templateRouter = Router();

/** GET /api/templates/solicitud-cnbv/status — estado del template. */
templateRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = templateStats();
    res.json(stats);
  }),
);

/** POST /api/templates/solicitud-cnbv — sube/reemplaza el template. */
templateRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  (req: Request, res: Response, next) => {
    uploadTemplate(req, res, (err) => {
      if (err) {
        const status =
          err.code === 'LIMIT_FILE_SIZE'
            ? 413
            : err.message?.includes('PDF')
              ? 400
              : 400;
        return res.status(status).json({
          error: { code: 'UPLOAD_REJECTED', message: err.message || 'Archivo rechazado' },
        });
      }
      next();
    });
  },
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('NO_FILE', 'No se recibió archivo', 400);
    }
    const numFields = await validatePdfTemplate(req.file.buffer);

    ensureTemplateDir();
    fs.writeFileSync(TEMPLATE_PATH, req.file.buffer);

    log.info(
      { size: req.file.size, fields: numFields, by: req.user?.email },
      'template solicitud-cnbv actualizado',
    );

    const stats = templateStats();
    res.status(201).json({
      ...stats,
      fields: numFields,
      message: 'Template actualizado correctamente',
    });
  }),
);

/** DELETE /api/templates/solicitud-cnbv — elimina el template. */
templateRouter.delete(
  '/',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!templateExists()) {
      return res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'No hay template subido' },
      });
    }
    fs.unlinkSync(TEMPLATE_PATH);
    log.info({ by: req.user?.email }, 'template solicitud-cnbv eliminado');
    res.json({ exists: false, message: 'Template eliminado' });
  }),
);

// ────────────────────────────────────────────────────────────────────
// Contract router — endpoint por contrato (se monta bajo /api/contracts)
// ────────────────────────────────────────────────────────────────────

export const contractRouter = Router();

/**
 * GET /api/contracts/:id/solicitud-cnbv
 *  Genera el PDF de Solicitud CNBV pre-llenado para el contrato.
 *  Query: ?download=1 → fuerza Content-Disposition: attachment
 */
contractRouter.get(
  '/:id/solicitud-cnbv',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const download = req.query.download === '1' || req.query.download === 'true';

    if (!templateExists()) {
      throw new AppError(
        'TEMPLATE_NOT_UPLOADED',
        'Aún no se ha subido el template de la Solicitud CNBV. Pide a un administrador que lo suba en /admin/templates.',
        409,
      );
    }

    // Validamos que el contrato exista (pre-flight para 404 limpio).
    const contract = await prisma.contract.findUnique({
      where: { id },
      select: { id: true, folio: true },
    });
    if (!contract) {
      throw new AppError('CONTRACT_NOT_FOUND', 'Contrato no encontrado', 404);
    }

    let result;
    try {
      result = await fillSolicitudCnbv(id);
    } catch (err) {
      if (err instanceof Error && err.message === 'TEMPLATE_NOT_UPLOADED') {
        throw new AppError('TEMPLATE_NOT_UPLOADED', 'Template no disponible', 409);
      }
      throw err;
    }

    log.info(
      {
        contractId: id,
        folio: contract.folio,
        text: result.coverage.text,
        check: result.coverage.check,
        missing: result.coverage.missing.length,
      },
      'pdf solicitud-cnbv generado',
    );

    const filename = `solicitud-cnbv-${contract.folio || id}.pdf`;
    const dispo = download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${dispo}; filename="${filename}"`);
    // Coverage en headers para que el frontend sepa cuántos fields se llenaron.
    res.setHeader('X-Solicitud-Text-Fields', String(result.coverage.text));
    res.setHeader('X-Solicitud-Check-Fields', String(result.coverage.check));
    res.setHeader('X-Solicitud-Missing-Fields', String(result.coverage.missing.length));
    res.send(Buffer.from(result.pdf));
  }),
);

export default { templateRouter, contractRouter };
