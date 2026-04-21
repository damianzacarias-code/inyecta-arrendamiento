// CRUD de Guarantor (obligados solidarios / avales).
//
// Los avales viven colgados del Client (son reutilizables entre
// operaciones del mismo titular); el vínculo a un Contract específico
// con su `orden` (1-3) vive en ContractGuarantor y se administra desde
// routes/contracts.ts#guarantors.
//
// Endpoints:
//   POST   /api/clients/:clientId/guarantors        crea un aval nuevo
//   GET    /api/clients/:clientId/guarantors        lista de avales del cliente
//   GET    /api/guarantors/:id                      detalle (incl. contratos donde está)
//   PUT    /api/guarantors/:id                      update parcial
//   DELETE /api/guarantors/:id                      soft delete (falla si está en un contrato)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { childLogger } from '../lib/logger';
import { createGuarantorSchema, updateGuarantorSchema } from '../schemas/guarantor';

const log = childLogger('guarantors');

const router = Router();

// ── POST /api/clients/:clientId/guarantors ──────────────────────
router.post('/clients/:clientId/guarantors', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const data = createGuarantorSchema.parse(req.body);

    // Garantizar defaults no-nulos para columnas requeridas en Prisma
    const guarantor = await prisma.guarantor.create({
      data: {
        ...data,
        nombre: data.nombre ?? data.razonSocial ?? 'N/D',
        apellidoPaterno: data.apellidoPaterno ?? '',
        clientId,
      } as any,
    });

    return res.status(201).json(guarantor);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Create guarantor error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── GET /api/clients/:clientId/guarantors ───────────────────────
router.get('/clients/:clientId/guarantors', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const guarantors = await prisma.guarantor.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { contratosAsociados: true } } },
    });
    return res.json(guarantors);
  } catch (error) {
    log.error({ err: error }, 'List guarantors error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── GET /api/guarantors/:id ─────────────────────────────────────
router.get('/guarantors/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const guarantor = await prisma.guarantor.findUnique({
      where: { id: req.params.id },
      include: {
        documentos: true,
        contratosAsociados: {
          include: {
            contract: {
              select: { id: true, folio: true, etapa: true, estatus: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!guarantor) return res.status(404).json({ error: 'Aval no encontrado' });
    return res.json(guarantor);
  } catch (error) {
    log.error({ err: error }, 'Get guarantor error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── PUT /api/guarantors/:id ─────────────────────────────────────
router.put('/guarantors/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.guarantor.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Aval no encontrado' });

    const data = updateGuarantorSchema.parse(req.body);
    const { clientId: _ignored, ...updateData } = data as any;

    const guarantor = await prisma.guarantor.update({
      where: { id: req.params.id },
      data: updateData,
    });
    return res.json(guarantor);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Update guarantor error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── DELETE /api/guarantors/:id ──────────────────────────────────
router.delete('/guarantors/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.guarantor.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { contratosAsociados: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Aval no encontrado' });
    if (existing._count.contratosAsociados > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: el aval está vinculado a contratos existentes. Desvincúlalo primero.',
      });
    }

    await prisma.guarantor.delete({ where: { id: req.params.id } });
    return res.status(204).end();
  } catch (error) {
    log.error({ err: error }, 'Delete guarantor error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
