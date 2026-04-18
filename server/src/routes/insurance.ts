import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Schema validación ───────────────────────────────────────
const policySchema = z.object({
  contractId: z.string().min(1),
  aseguradora: z.string().optional(),
  numPoliza: z.string().optional(),
  tipoCobertura: z.string().optional(),
  montoAsegurado: z.number().nonnegative().optional(),
  primaAnual: z.number().nonnegative().optional(),
  fechaInicio: z.string().optional(),
  fechaVencimiento: z.string().optional(),
  endosoPref: z.boolean().default(true),
  vigente: z.boolean().default(true),
  observaciones: z.string().optional(),
});

const ALERT_THRESHOLD_DAYS = 30;

// Niveles de alerta para el centro de notificaciones
type AlertLevel = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' | null;

// ─── Helper: clasifica el estado de la póliza ────────────────
function getPolicyStatus(p: { fechaVencimiento: Date | null; vigente: boolean }) {
  if (!p.vigente) return { status: 'INACTIVA', daysToExpire: null, alertLevel: null as AlertLevel };
  if (!p.fechaVencimiento) return { status: 'SIN_FECHA', daysToExpire: null, alertLevel: 'MEDIA' as AlertLevel };

  const now = new Date();
  const exp = new Date(p.fechaVencimiento);
  const daysToExpire = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Niveles de alerta:
  //   CRITICA: vencida (negativos)
  //   ALTA:    ≤ 7 días para vencer
  //   MEDIA:   ≤ 15 días
  //   BAJA:    ≤ 30 días
  let alertLevel: AlertLevel = null;
  if (daysToExpire < 0) alertLevel = 'CRITICA';
  else if (daysToExpire <= 7) alertLevel = 'ALTA';
  else if (daysToExpire <= 15) alertLevel = 'MEDIA';
  else if (daysToExpire <= ALERT_THRESHOLD_DAYS) alertLevel = 'BAJA';

  if (daysToExpire < 0) return { status: 'VENCIDA', daysToExpire, alertLevel };
  if (daysToExpire <= ALERT_THRESHOLD_DAYS) return { status: 'POR_VENCER', daysToExpire, alertLevel };
  return { status: 'VIGENTE', daysToExpire, alertLevel: null as AlertLevel };
}

// ─── GET /api/insurance ──────────────────────────────────────
// Lista todas las pólizas + contratos sin póliza vigente
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId, status } = req.query;

    const where: any = {};
    if (contractId) where.contractId = contractId;

    const policies = await prisma.insurancePolicy.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            folio: true,
            bienDescripcion: true,
            bienMarca: true,
            bienModelo: true,
            estatus: true,
            client: {
              select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true },
            },
          },
        },
      },
      orderBy: [{ vigente: 'desc' }, { fechaVencimiento: 'asc' }],
    });

    // Enriquecer con estado calculado
    const enriched = policies.map(p => {
      const s = getPolicyStatus(p);
      return { ...p, ...s };
    });

    // Filtrar por estado si se solicita
    let filtered = enriched;
    if (status) {
      filtered = enriched.filter(p => p.status === status);
    }

    // Contratos vigentes sin póliza vigente
    const activeContracts = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      select: {
        id: true,
        folio: true,
        bienDescripcion: true,
        seguros: { where: { vigente: true }, select: { id: true } },
        client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
      },
    });
    const sinPoliza = activeContracts
      .filter(c => c.seguros.length === 0)
      .map(c => ({ id: c.id, folio: c.folio, bienDescripcion: c.bienDescripcion, client: c.client }));

    // Resumen
    const summary = {
      total: enriched.length,
      vigentes: enriched.filter(p => p.status === 'VIGENTE').length,
      porVencer: enriched.filter(p => p.status === 'POR_VENCER').length,
      vencidas: enriched.filter(p => p.status === 'VENCIDA').length,
      inactivas: enriched.filter(p => p.status === 'INACTIVA').length,
      sinPoliza: sinPoliza.length,
      montoAseguradoTotal: enriched
        .filter(p => p.status === 'VIGENTE' || p.status === 'POR_VENCER')
        .reduce((s, p) => s + Number(p.montoAsegurado || 0), 0),
      primaAnualTotal: enriched
        .filter(p => p.status === 'VIGENTE' || p.status === 'POR_VENCER')
        .reduce((s, p) => s + Number(p.primaAnual || 0), 0),
    };

    res.json({ data: filtered, sinPoliza, summary });
  } catch (error) {
    console.error('List policies error:', error);
    res.status(500).json({ error: 'Error al obtener pólizas' });
  }
});

// ─── GET /api/insurance/:id ──────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: req.params.id },
      include: {
        contract: {
          include: {
            client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true } },
          },
        },
      },
    });

    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada' });

    const s = getPolicyStatus(policy);
    res.json({ ...policy, ...s });
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({ error: 'Error al obtener póliza' });
  }
});

// ─── POST /api/insurance ─────────────────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = policySchema.parse(req.body);

    // Verificar que el contrato existe
    const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
    if (!contract) return res.status(400).json({ error: 'Contrato no encontrado' });

    const policy = await prisma.insurancePolicy.create({
      data: {
        ...data,
        fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null,
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
      },
    });

    res.status(201).json(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create policy error:', error);
    res.status(500).json({ error: 'Error al crear póliza' });
  }
});

// ─── PUT /api/insurance/:id ──────────────────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = policySchema.partial().parse(req.body);

    const policy = await prisma.insurancePolicy.update({
      where: { id: req.params.id },
      data: {
        ...data,
        fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : undefined,
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : undefined,
      },
    });

    res.json(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update policy error:', error);
    res.status(500).json({ error: 'Error al actualizar póliza' });
  }
});

// ─── POST /api/insurance/:id/renew ───────────────────────────
// Renueva una póliza: marca la anterior como inactiva y crea una nueva
router.post('/:id/renew', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fechaInicio, fechaVencimiento, primaAnual, numPoliza, montoAsegurado } = req.body;

    if (!fechaInicio || !fechaVencimiento) {
      return res.status(400).json({ error: 'Fecha de inicio y vencimiento son requeridos' });
    }

    const oldPolicy = await prisma.insurancePolicy.findUnique({ where: { id: req.params.id } });
    if (!oldPolicy) return res.status(404).json({ error: 'Póliza no encontrada' });

    // Marcar la anterior como inactiva
    await prisma.insurancePolicy.update({
      where: { id: req.params.id },
      data: { vigente: false, observaciones: `${oldPolicy.observaciones || ''}\nRenovada: ${new Date().toISOString()}`.trim() },
    });

    // Crear la nueva
    const newPolicy = await prisma.insurancePolicy.create({
      data: {
        contractId: oldPolicy.contractId,
        aseguradora: oldPolicy.aseguradora,
        numPoliza: numPoliza || oldPolicy.numPoliza,
        tipoCobertura: oldPolicy.tipoCobertura,
        montoAsegurado: montoAsegurado !== undefined ? montoAsegurado : oldPolicy.montoAsegurado,
        primaAnual: primaAnual !== undefined ? primaAnual : oldPolicy.primaAnual,
        fechaInicio: new Date(fechaInicio),
        fechaVencimiento: new Date(fechaVencimiento),
        endosoPref: oldPolicy.endosoPref,
        vigente: true,
      },
    });

    res.status(201).json(newPolicy);
  } catch (error) {
    console.error('Renew policy error:', error);
    res.status(500).json({ error: 'Error al renovar póliza' });
  }
});

// ─── GET /api/insurance/alerts ───────────────────────────────
// Lista única de items accionables para el Centro de Alertas:
//   - Pólizas vencidas
//   - Pólizas por vencer (≤30 días)
//   - Contratos vigentes sin póliza
// Cada item viene con prioridad (CRITICA/ALTA/MEDIA/BAJA), categoría y CTA.
router.get('/alerts', requireAuth, async (_req: Request, res: Response) => {
  try {
    // Pólizas con vencimiento próximo o vencido
    const policies = await prisma.insurancePolicy.findMany({
      where: { vigente: true },
      include: {
        contract: {
          select: {
            id: true, folio: true, bienDescripcion: true,
            client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
          },
        },
      },
    });

    const alerts: any[] = [];

    for (const p of policies) {
      const s = getPolicyStatus(p);
      if (!s.alertLevel) continue;
      const cName = p.contract.client.tipo === 'PM'
        ? p.contract.client.razonSocial
        : `${p.contract.client.nombre || ''} ${p.contract.client.apellidoPaterno || ''}`.trim();
      alerts.push({
        kind: 'POLIZA_VENCIMIENTO',
        level: s.alertLevel,
        policyId: p.id,
        contractId: p.contract.id,
        contractFolio: p.contract.folio,
        cliente: cName,
        bien: p.contract.bienDescripcion,
        aseguradora: p.aseguradora,
        numPoliza: p.numPoliza,
        diasRestantes: s.daysToExpire,
        fechaVencimiento: p.fechaVencimiento,
        mensaje: s.status === 'VENCIDA'
          ? `Póliza VENCIDA hace ${Math.abs(s.daysToExpire || 0)} días`
          : `Póliza vence en ${s.daysToExpire} días`,
        action: 'RENOVAR',
        actionUrl: `/seguros?renew=${p.id}`,
      });
    }

    // Contratos vigentes sin póliza
    const sinPolizaContracts = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      select: {
        id: true, folio: true, bienDescripcion: true,
        seguros: { where: { vigente: true }, select: { id: true } },
        client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
      },
    });

    sinPolizaContracts
      .filter(c => c.seguros.length === 0)
      .forEach(c => {
        const cName = c.client.tipo === 'PM'
          ? c.client.razonSocial
          : `${c.client.nombre || ''} ${c.client.apellidoPaterno || ''}`.trim();
        alerts.push({
          kind: 'SIN_POLIZA',
          level: 'ALTA' as AlertLevel,
          contractId: c.id,
          contractFolio: c.folio,
          cliente: cName,
          bien: c.bienDescripcion,
          mensaje: 'Contrato vigente SIN póliza de seguro',
          action: 'CREAR',
          actionUrl: `/seguros?create=${c.id}`,
        });
      });

    // Ordenar por prioridad: CRITICA > ALTA > MEDIA > BAJA
    const order: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
    alerts.sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));

    res.json({
      total: alerts.length,
      criticas: alerts.filter(a => a.level === 'CRITICA').length,
      altas: alerts.filter(a => a.level === 'ALTA').length,
      medias: alerts.filter(a => a.level === 'MEDIA').length,
      bajas: alerts.filter(a => a.level === 'BAJA').length,
      alerts,
    });
  } catch (error) {
    console.error('Insurance alerts error:', error);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

// ─── POST /api/insurance/:id/acknowledge ─────────────────────
// Marca que el operador vio una alerta (deja huella en observaciones)
router.post('/:id/acknowledge', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const policy = await prisma.insurancePolicy.findUnique({ where: { id: req.params.id } });
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada' });

    const ts = new Date().toISOString().slice(0, 16);
    const updated = await prisma.insurancePolicy.update({
      where: { id: req.params.id },
      data: {
        observaciones: `${policy.observaciones || ''}\n[${ts}] Alerta revisada por ${userId}`.trim(),
      },
    });
    res.json({ ok: true, policy: updated });
  } catch (error) {
    console.error('Acknowledge error:', error);
    res.status(500).json({ error: 'Error al confirmar revisión' });
  }
});

// ─── GET /api/insurance/:id/suggest-renewal ──────────────────
// Sugiere fechas y prima para renovar la póliza:
//   - fechaInicio = fechaVencimiento actual + 1 día
//   - fechaVencimiento sugerida = +12 meses
//   - primaSugerida = primaActual × (1 + factorInflacion). Default 5%
router.get('/:id/suggest-renewal', requireAuth, async (req: Request, res: Response) => {
  try {
    const inflacion = parseFloat(String(req.query.inflacion || '0.05'));
    const policy = await prisma.insurancePolicy.findUnique({ where: { id: req.params.id } });
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada' });

    const baseFecha = policy.fechaVencimiento || new Date();
    const fechaInicio = new Date(baseFecha);
    fechaInicio.setDate(fechaInicio.getDate() + 1);
    const fechaVencimiento = new Date(fechaInicio);
    fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

    const primaActual = Number(policy.primaAnual || 0);
    const primaSugerida = Math.round(primaActual * (1 + inflacion) * 100) / 100;

    res.json({
      fechaInicio,
      fechaVencimiento,
      primaActual,
      primaSugerida,
      inflacionAplicada: inflacion,
      aseguradora: policy.aseguradora,
      tipoCobertura: policy.tipoCobertura,
      montoAsegurado: Number(policy.montoAsegurado || 0),
    });
  } catch (error) {
    console.error('Suggest renewal error:', error);
    res.status(500).json({ error: 'Error al sugerir renovación' });
  }
});

// ─── DELETE /api/insurance/:id ───────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.insurancePolicy.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete policy error:', error);
    res.status(500).json({ error: 'Error al eliminar póliza' });
  }
});

export default router;
