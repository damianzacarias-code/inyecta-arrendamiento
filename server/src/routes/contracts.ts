import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { notificar } from '../lib/notificar';
import { childLogger } from '../lib/logger';

const log = childLogger('contracts');

const router = Router();

/** Devuelve un nombre legible del cliente: razón social (PM) o "nombre apellido" (PF). */
function nombreCliente(c: { tipo: string; nombre?: string | null; apellidoPaterno?: string | null; razonSocial?: string | null } | null | undefined): string {
  if (!c) return 'cliente';
  if (c.tipo === 'PM') return c.razonSocial || 'cliente';
  return `${c.nombre || ''} ${c.apellidoPaterno || ''}`.trim() || 'cliente';
}

/** Formatea un monto como moneda MXN sin depender de Intl en el server.
 *  Acepta number, string o Decimal de Prisma (cualquier cosa con toString numérico). */
function fmt$(n: number | string | { toString(): string }): string {
  const num = typeof n === 'number' ? n : Number(n.toString());
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STAGE_ORDER = ['SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO'];

const STAGE_LABELS: Record<string, string> = {
  SOLICITUD: 'Solicitud',
  ANALISIS_CLIENTE: 'Analisis Cliente',
  ANALISIS_BIEN: 'Analisis Bien',
  COMITE: 'Comite',
  FORMALIZACION: 'Formalizacion',
  DESEMBOLSO: 'Desembolso',
  ACTIVO: 'Activo',
};

const createContractSchema = z.object({
  clientId: z.string(),
  quotationId: z.string().optional(),
  categoriaId: z.string().optional(),
  bienDescripcion: z.string().min(1),
  bienMarca: z.string().optional(),
  bienModelo: z.string().optional(),
  bienAnio: z.number().optional(),
  bienNumSerie: z.string().optional(),
  bienEstado: z.string().optional(),
  proveedor: z.string().optional(),
  producto: z.enum(['PURO', 'FINANCIERO']),
  valorBien: z.number().min(150000),
  plazo: z.number().min(12).max(48),
  tasaAnual: z.number().default(0.36),
  nivelRiesgo: z.enum(['A', 'B', 'C']).default('A'),
  enganche: z.number().default(0),
  depositoGarantia: z.number().default(0),
  comisionApertura: z.number().default(0),
  rentaInicial: z.number().default(0),
  gpsInstalacion: z.number().default(0),
  seguroAnual: z.number().default(0),
  valorResidual: z.number().default(0),
  montoFinanciar: z.number(),
  rentaMensual: z.number(),
  rentaMensualIVA: z.number(),
});

// POST /api/contracts - Crear contrato
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createContractSchema.parse(req.body);
    const userId = req.user!.userId;

    // Generar folio
    const year = new Date().getFullYear();
    const count = await prisma.contract.count();
    const folio = `ARR-${String(count + 1).padStart(3, '0')}-${year}`;

    const valorBienIVA = data.valorBien * 1.16;

    // Si viene desde una cotización, validar que no esté ya convertida
    let cotizacionFolio: string | null = null;
    if (data.quotationId) {
      const cotizacion = await prisma.quotation.findUnique({
        where: { id: data.quotationId },
        include: { contrato: { select: { id: true, folio: true } } },
      });
      if (!cotizacion) return res.status(400).json({ error: 'Cotización no encontrada' });
      if (cotizacion.contrato) {
        return res.status(400).json({
          error: `La cotización ya generó el contrato ${cotizacion.contrato.folio}`,
          contratoId: cotizacion.contrato.id,
        });
      }
      if (cotizacion.estado === 'RECHAZADA' || cotizacion.estado === 'VENCIDA') {
        return res.status(400).json({
          error: `No se puede crear contrato desde una cotización ${cotizacion.estado.toLowerCase()}`,
        });
      }
      cotizacionFolio = cotizacion.folio;
    }

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          folio,
          clientId: data.clientId,
          quotationId: data.quotationId || null,
          userId,
          categoriaId: data.categoriaId || null,
          bienDescripcion: data.bienDescripcion,
          bienMarca: data.bienMarca,
          bienModelo: data.bienModelo,
          bienAnio: data.bienAnio,
          bienNumSerie: data.bienNumSerie,
          bienEstado: data.bienEstado,
          proveedor: data.proveedor,
          producto: data.producto,
          valorBien: data.valorBien,
          valorBienIVA,
          plazo: data.plazo,
          tasaAnual: data.tasaAnual,
          nivelRiesgo: data.nivelRiesgo,
          enganche: data.enganche,
          depositoGarantia: data.depositoGarantia,
          comisionApertura: data.comisionApertura,
          rentaInicial: data.rentaInicial,
          gpsInstalacion: data.gpsInstalacion,
          seguroAnual: data.seguroAnual,
          valorResidual: data.valorResidual,
          montoFinanciar: data.montoFinanciar,
          rentaMensual: data.rentaMensual,
          rentaMensualIVA: data.rentaMensualIVA,
          etapa: 'SOLICITUD',
          stageHistory: {
            create: {
              etapa: 'SOLICITUD',
              observacion: cotizacionFolio
                ? `Contrato creado desde cotización ${cotizacionFolio}`
                : 'Contrato creado',
              usuarioId: userId,
            },
          },
        },
        include: {
          client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true } },
          user: { select: { nombre: true, apellidos: true } },
          stageHistory: { orderBy: { fecha: 'desc' } },
        },
      });

      if (data.quotationId) {
        await tx.quotation.update({
          where: { id: data.quotationId },
          data: { estado: 'CONVERTIDA' },
        });
      }

      return created;
    });

    // Notificación: SOLICITUD_CREADA → ADMIN + LEGAL + ejecutivo
    notificar({
      tipo: 'SOLICITUD_CREADA',
      titulo: `Nueva solicitud ${contract.folio}`,
      mensaje: `${contract.bienDescripcion} por ${fmt$(contract.montoFinanciar)} — cliente ${nombreCliente(contract.client)}`,
      entidad: 'Contract',
      entidadId: contract.id,
      url: `/contratos/${contract.id}`,
      ejecutivoId: userId,
    });

    return res.status(201).json(contract);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Create contract error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contracts - Listar contratos (pipeline view)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { etapa, estatus, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (etapa) where.etapa = etapa;
    if (estatus) where.estatus = estatus;

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true } },
          user: { select: { nombre: true, apellidos: true } },
        },
      }),
      prisma.contract.count({ where }),
    ]);

    // Pipeline counts
    const stageCounts = await prisma.contract.groupBy({
      by: ['etapa'],
      where: { estatus: 'EN_PROCESO' },
      _count: true,
    });

    const pipeline = STAGE_ORDER.map(stage => ({
      stage,
      label: STAGE_LABELS[stage],
      count: stageCounts.find(s => s.etapa === stage)?._count || 0,
    }));

    return res.json({
      data: contracts,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      pipeline,
    });
  } catch (error) {
    log.error({ err: error }, 'List contracts error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contracts/:id - Detalle contrato
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        user: { select: { nombre: true, apellidos: true, email: true } },
        categoria: { select: { nombre: true, requiereGPS: true } },
        stageHistory: { orderBy: { fecha: 'desc' } },
        notas: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { user: { select: { nombre: true, apellidos: true } } },
        },
      },
    });

    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
    return res.json(contract);
  } catch (error) {
    log.error({ err: error }, 'Get contract error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contracts/:id/advance - Avanzar etapa
router.put('/:id/advance', requireAuth, async (req: Request, res: Response) => {
  try {
    const { observacion, comiteResolucion } = req.body;
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const currentIdx = STAGE_ORDER.indexOf(contract.etapa);
    if (currentIdx >= STAGE_ORDER.length - 1) {
      return res.status(400).json({ error: 'El contrato ya esta en la ultima etapa' });
    }

    // Comite check
    if (contract.etapa === 'COMITE' && !comiteResolucion) {
      return res.status(400).json({ error: 'Se requiere resolucion del comite (APROBADO, APROBADO_CONDICIONES, RECHAZADO)' });
    }

    if (contract.etapa === 'COMITE' && comiteResolucion === 'RECHAZADO') {
      // Rechazado en comite
      const updated = await prisma.contract.update({
        where: { id: req.params.id },
        data: {
          comiteResolucion,
          estatus: 'RESCINDIDO',
          motivoTerminacion: observacion || 'Rechazado en comite',
          stageHistory: {
            create: { etapa: contract.etapa, observacion: `Comite: ${comiteResolucion}. ${observacion || ''}`, usuarioId: req.user!.userId },
          },
        },
        include: {
          client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
          stageHistory: { orderBy: { fecha: 'desc' } },
        },
      });
      // Notificación: rechazo en comité → ADMIN + ejecutivo
      notificar({
        tipo: 'CONTRATO_RESCINDIDO',
        titulo: `Comité rechazó ${updated.folio}`,
        mensaje: `Cliente ${nombreCliente(updated.client)}. ${observacion || ''}`.trim(),
        entidad: 'Contract',
        entidadId: updated.id,
        url: `/contratos/${updated.id}`,
        ejecutivoId: updated.userId,
      });
      return res.json(updated);
    }

    const nextStage = STAGE_ORDER[currentIdx + 1];

    const updateData: any = {
      etapa: nextStage,
      etapaFecha: new Date(),
      stageHistory: {
        create: { etapa: nextStage, observacion: observacion || `Avanzado a ${STAGE_LABELS[nextStage]}`, usuarioId: req.user!.userId },
      },
    };

    if (comiteResolucion) updateData.comiteResolucion = comiteResolucion;
    if (nextStage === 'ACTIVO') {
      updateData.estatus = 'VIGENTE';
      updateData.fechaInicio = new Date();
      // Generate amortization table
      const fechaInicio = new Date();
      const tasaMensual = Number(contract.tasaAnual) / 12;
      const monto = Number(contract.montoFinanciar);
      const plazoMeses = contract.plazo;
      const seguroMensual = Number(contract.seguroAnual) / 12;
      const isPuro = contract.producto === 'PURO';

      // PMT
      let rentaBase: number;
      if (tasaMensual === 0) {
        rentaBase = monto / plazoMeses;
      } else {
        rentaBase = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
      }

      const amortEntries = [];
      let saldo = monto;
      for (let i = 1; i <= plazoMeses; i++) {
        const fechaPago = new Date(fechaInicio);
        fechaPago.setMonth(fechaPago.getMonth() + i);
        const interes = saldo * tasaMensual;
        const capital = isPuro ? 0 : rentaBase - interes;
        const renta = isPuro ? rentaBase : rentaBase;
        const iva = renta * 0.16;
        const pagoTotal = renta + iva + seguroMensual;
        const saldoFinal = isPuro ? saldo : Math.max(0, saldo - capital);

        amortEntries.push({
          periodo: i,
          fechaPago,
          saldoInicial: Math.round(saldo * 100) / 100,
          intereses: Math.round(interes * 100) / 100,
          pagoCapital: Math.round(capital * 100) / 100,
          renta: Math.round(renta * 100) / 100,
          iva: Math.round(iva * 100) / 100,
          seguro: Math.round(seguroMensual * 100) / 100,
          pagoTotal: Math.round(pagoTotal * 100) / 100,
          saldoFinal: Math.round(saldoFinal * 100) / 100,
        });
        saldo = saldoFinal;
      }

      updateData.amortizacion = { createMany: { data: amortEntries } };
      updateData.fechaVencimiento = amortEntries[amortEntries.length - 1].fechaPago;
    }

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
        stageHistory: { orderBy: { fecha: 'desc' } },
      },
    });

    // Notificación: etapa avanzada (con caso especial cuando llega a ACTIVO)
    if (nextStage === 'ACTIVO') {
      notificar({
        tipo: 'CONTRATO_ACTIVADO',
        titulo: `Contrato ${updated.folio} activado`,
        mensaje: `${nombreCliente(updated.client)} — vigente, primera renta ${updateData.fechaVencimiento ? '' : ''}`,
        entidad: 'Contract',
        entidadId: updated.id,
        url: `/contratos/${updated.id}`,
        ejecutivoId: updated.userId,
      });
    } else {
      notificar({
        tipo: 'ETAPA_AVANZADA',
        titulo: `${updated.folio} → ${STAGE_LABELS[nextStage]}`,
        mensaje: `Cliente ${nombreCliente(updated.client)}. ${observacion || ''}`.trim(),
        entidad: 'Contract',
        entidadId: updated.id,
        url: `/contratos/${updated.id}`,
        ejecutivoId: updated.userId,
      });
    }

    return res.json(updated);
  } catch (error) {
    log.error({ err: error }, 'Advance contract error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contracts/:id/notes - Agregar nota
router.post('/:id/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contenido } = req.body;
    if (!contenido?.trim()) return res.status(400).json({ error: 'Contenido requerido' });

    const note = await prisma.note.create({
      data: {
        contractId: req.params.id,
        userId: req.user!.userId,
        contenido: contenido.trim(),
      },
      include: { user: { select: { nombre: true, apellidos: true } } },
    });
    return res.status(201).json(note);
  } catch (error) {
    log.error({ err: error }, 'Create note error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
