/**
 * /api/contracts/:contractId/pagare — Pagaré (sólo FINANCIERO)
 * --------------------------------------------------------------
 * Cláusula DÉCIMA TERCERA del contrato FIN: "LA ARRENDATARIA y EL
 * OBLIGADO SOLIDARIO Y/O AVALISTA suscriben a la orden de LA
 * ARRENDADORA un pagaré por el importe total del precio pactado por
 * concepto de renta global. Dicho título de crédito deberá tener
 * como fecha de vencimiento la misma fecha de terminación del plazo
 * forzoso."
 *
 * Es título ejecutivo independiente — sin él Inyecta no tendría vía
 * cambiaria, sólo civil/mercantil. 1:1 con Contract.
 *
 * Endpoints:
 *   GET    /api/contracts/:contractId/pagare    → detalle (404 si no existe)
 *   PUT    /api/contracts/:contractId/pagare    → upsert
 *   DELETE /api/contracts/:contractId/pagare    → baja
 *
 * Auth: ADMIN/DIRECTOR/LEGAL/OPERACIONES.
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router({ mergeParams: true });

// Acepta string ISO o Date. Fechas inválidas rebotan con VALIDATION_ERROR.
const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v;
  if (typeof v === 'string' && v.length >= 8) return new Date(v);
  return v;
}, z.date());

const upsertSchema = z.object({
  numeroPagare: z.string().trim().min(1).max(60),
  fechaSuscripcion: dateLike,
  fechaVencimiento: dateLike,
  // Acepta number (UI) y lo serializamos a Decimal en Prisma sin precisión perdida
  // porque viene del backend ya calculado (renta × plazo × 1.16).
  montoPagare: z.number().positive(),
  lugarSuscripcion: z.string().trim().max(180).optional().nullable(),
  observaciones: z.string().trim().max(2000).optional().nullable(),
});

router.use(requireAuth);

router.get(
  '/',
  requireRole('ADMIN', 'DIRECTOR', 'ANALISTA', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req, res) => {
    const { contractId } = req.params as { contractId: string };
    const pagare = await prisma.pagare.findUnique({ where: { contractId } });
    if (!pagare) throw new AppError('PAGARE_NOT_FOUND', 'Pagaré no encontrado', 404);
    res.json({ pagare });
  }),
);

router.put(
  '/',
  requireRole('ADMIN', 'DIRECTOR', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req, res) => {
    const { contractId } = req.params as { contractId: string };
    const data = upsertSchema.parse(req.body);

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new AppError('CONTRACT_NOT_FOUND', 'Contrato no encontrado', 404);
    if (contract.producto !== 'FINANCIERO') {
      throw new AppError(
        'PAGARE_REQUIRES_FIN',
        'El pagaré solo aplica a contratos de Arrendamiento Financiero',
        409,
      );
    }
    if (data.fechaVencimiento <= data.fechaSuscripcion) {
      throw new AppError(
        'INVALID_DATES',
        'La fecha de vencimiento debe ser posterior a la fecha de suscripción',
        400,
      );
    }

    const pagare = await prisma.pagare.upsert({
      where: { contractId },
      create: { ...data, contractId },
      update: data,
    });
    res.json({ pagare });
  }),
);

router.delete(
  '/',
  requireRole('ADMIN', 'DIRECTOR', 'LEGAL'),
  asyncHandler(async (req, res) => {
    const { contractId } = req.params as { contractId: string };
    const existing = await prisma.pagare.findUnique({ where: { contractId } });
    if (!existing) throw new AppError('PAGARE_NOT_FOUND', 'Pagaré no encontrado', 404);
    await prisma.pagare.delete({ where: { contractId } });
    res.json({ ok: true });
  }),
);

export default router;
