import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Schema validación ───────────────────────────────────────
const gpsSchema = z.object({
  contractId: z.string().min(1),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  numSerie: z.string().optional(),
  proveedor: z.string().optional(),
  fechaInstalacion: z.string().optional(),
  activo: z.boolean().default(true),
  costoInstalacion: z.number().nonnegative().optional(),
  observaciones: z.string().optional(),
});

// ─── GET /api/gps ────────────────────────────────────────────
// Lista todos los dispositivos + contratos vigentes que requieren GPS pero no tienen uno activo
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId, activo, proveedor } = req.query;

    const where: any = {};
    if (contractId) where.contractId = contractId;
    if (activo === 'true') where.activo = true;
    if (activo === 'false') where.activo = false;
    if (proveedor) where.proveedor = proveedor;

    const devices = await prisma.gPSDevice.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            folio: true,
            bienDescripcion: true,
            bienMarca: true,
            bienModelo: true,
            bienNumSerie: true,
            estatus: true,
            categoria: { select: { id: true, nombre: true, requiereGPS: true } },
            client: {
              select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, telefono: true },
            },
          },
        },
      },
      orderBy: [{ activo: 'desc' }, { fechaInstalacion: 'desc' }],
    });

    // Contratos vigentes que requieren GPS pero no lo tienen activo
    const activeContracts = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      select: {
        id: true,
        folio: true,
        bienDescripcion: true,
        bienMarca: true,
        bienModelo: true,
        gpsInstalacion: true,
        categoria: { select: { nombre: true, requiereGPS: true } },
        gps: { where: { activo: true }, select: { id: true } },
        client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
      },
    });

    const sinGPS = activeContracts
      .filter(c => {
        const requiere = c.categoria?.requiereGPS || Number(c.gpsInstalacion) > 0;
        return requiere && c.gps.length === 0;
      })
      .map(c => ({
        id: c.id,
        folio: c.folio,
        bienDescripcion: c.bienDescripcion,
        bienMarca: c.bienMarca,
        bienModelo: c.bienModelo,
        categoria: c.categoria?.nombre,
        client: c.client,
      }));

    // Resumen
    const activos = devices.filter(d => d.activo);
    const summary = {
      total: devices.length,
      activos: activos.length,
      inactivos: devices.filter(d => !d.activo).length,
      sinGPS: sinGPS.length,
      inversionTotal: devices.reduce((s, d) => s + Number(d.costoInstalacion || 0), 0),
      inversionActiva: activos.reduce((s, d) => s + Number(d.costoInstalacion || 0), 0),
      porProveedor: Array.from(
        devices.reduce((m, d) => {
          const p = d.proveedor || 'Sin especificar';
          m.set(p, (m.get(p) || 0) + (d.activo ? 1 : 0));
          return m;
        }, new Map<string, number>())
      ).map(([proveedor, count]) => ({ proveedor, count })),
    };

    res.json({ data: devices, sinGPS, summary });
  } catch (error) {
    console.error('List GPS error:', error);
    res.status(500).json({ error: 'Error al obtener dispositivos GPS' });
  }
});

// ─── GET /api/gps/:id ────────────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const device = await prisma.gPSDevice.findUnique({
      where: { id: req.params.id },
      include: {
        contract: {
          include: {
            client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true, telefono: true } },
          },
        },
      },
    });

    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    res.json(device);
  } catch (error) {
    console.error('Get GPS error:', error);
    res.status(500).json({ error: 'Error al obtener dispositivo' });
  }
});

// ─── POST /api/gps ───────────────────────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = gpsSchema.parse(req.body);

    const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
    if (!contract) return res.status(400).json({ error: 'Contrato no encontrado' });

    // Verificar unicidad del número de serie (si se proporciona)
    if (data.numSerie) {
      const existing = await prisma.gPSDevice.findFirst({
        where: { numSerie: data.numSerie, activo: true },
      });
      if (existing) {
        return res.status(400).json({ error: `Ya existe un dispositivo activo con número de serie ${data.numSerie}` });
      }
    }

    const device = await prisma.gPSDevice.create({
      data: {
        ...data,
        fechaInstalacion: data.fechaInstalacion ? new Date(data.fechaInstalacion) : new Date(),
      },
    });

    res.status(201).json(device);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create GPS error:', error);
    res.status(500).json({ error: 'Error al crear dispositivo' });
  }
});

// ─── PUT /api/gps/:id ────────────────────────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = gpsSchema.partial().parse(req.body);

    const device = await prisma.gPSDevice.update({
      where: { id: req.params.id },
      data: {
        ...data,
        fechaInstalacion: data.fechaInstalacion ? new Date(data.fechaInstalacion) : undefined,
      },
    });

    res.json(device);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update GPS error:', error);
    res.status(500).json({ error: 'Error al actualizar dispositivo' });
  }
});

// ─── POST /api/gps/:id/uninstall ─────────────────────────────
// Marca un dispositivo como retirado (activo=false) con observación
router.post('/:id/uninstall', requireAuth, async (req: Request, res: Response) => {
  try {
    const { motivo } = req.body;

    const device = await prisma.gPSDevice.findUnique({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const nota = `Retirado ${new Date().toISOString().slice(0, 10)}${motivo ? `: ${motivo}` : ''}`;
    const observaciones = [device.observaciones, nota].filter(Boolean).join('\n');

    const updated = await prisma.gPSDevice.update({
      where: { id: req.params.id },
      data: { activo: false, observaciones },
    });

    res.json(updated);
  } catch (error) {
    console.error('Uninstall GPS error:', error);
    res.status(500).json({ error: 'Error al retirar dispositivo' });
  }
});

// ─── DELETE /api/gps/:id ─────────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.gPSDevice.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete GPS error:', error);
    res.status(500).json({ error: 'Error al eliminar dispositivo' });
  }
});

export default router;
