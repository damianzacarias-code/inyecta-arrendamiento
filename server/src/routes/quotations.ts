import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { calcularArrendamiento, generarOpcionesRiesgo } from '../services/leaseCalculator';
import { notificar } from '../lib/notificar';

const router = Router();

function fmt$(n: number | string | { toString(): string }): string {
  const num = typeof n === 'number' ? n : Number(n.toString());
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const quotationSchema = z.object({
  clientId: z.string().optional(),
  nombreCliente: z.string().min(1),
  categoriaId: z.string().optional(),
  bienDescripcion: z.string().optional(),
  bienMarca: z.string().optional(),
  bienModelo: z.string().optional(),
  bienAnio: z.number().optional(),
  bienNuevo: z.boolean().default(true),
  producto: z.enum(['PURO', 'FINANCIERO']),
  valorBien: z.number().min(150000).max(3000000),
  plazo: z.number().min(12).max(48),
  tasaAnual: z.number().min(0).max(1).default(0.36),
  nivelRiesgo: z.enum(['A', 'B', 'C']).default('A'),
  enganchePct: z.number().min(0).max(1).default(0),
  depositoGarantiaPct: z.number().min(0).max(1).default(0.16),
  comisionAperturaPct: z.number().min(0).max(1).default(0.05),
  comisionAperturaFinanciada: z.boolean().default(true),
  valorResidualPct: z.number().min(0).max(1).default(0.16),
  rentaInicial: z.number().default(0),
  gpsInstalacion: z.number().default(4200),
  gpsFinanciado: z.boolean().default(true),
  seguroAnual: z.number().default(0),
  seguroFinanciado: z.boolean().default(true),
  generarOpciones: z.boolean().default(false),
  observaciones: z.string().optional(),
});

// POST /api/quotations - Crear cotización
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = quotationSchema.parse(req.body);
    const userId = req.user!.userId;

    // Generar folio
    const count = await prisma.quotation.count();
    const folio = `COT-${String(count + 1).padStart(4, '0')}`;

    // Calcular
    const resultado = calcularArrendamiento({
      producto: data.producto,
      valorBien: data.valorBien,
      plazo: data.plazo,
      tasaAnual: data.tasaAnual,
      enganchePct: data.enganchePct,
      depositoGarantiaPct: data.depositoGarantiaPct,
      comisionAperturaPct: data.comisionAperturaPct,
      comisionAperturaFinanciada: data.comisionAperturaFinanciada,
      valorResidualPct: data.valorResidualPct,
      rentaInicial: data.rentaInicial,
      gpsInstalacion: data.gpsInstalacion,
      gpsFinanciado: data.gpsFinanciado,
      seguroAnual: data.seguroAnual,
      seguroFinanciado: data.seguroFinanciado,
    });

    // Generar opciones de riesgo si se solicitan
    let opcionesData: any[] = [];
    if (data.generarOpciones) {
      const opciones = generarOpcionesRiesgo(
        data.valorBien, data.plazo, data.tasaAnual,
        data.gpsInstalacion, data.comisionAperturaPct
      );
      opcionesData = opciones.map(op => ({
        nombre: op.nombre,
        producto: op.producto,
        nivelRiesgo: op.nivelRiesgo as any,
        enganche: op.enganche,
        rentaInicial: 0,
        depositoGarantia: op.depositoGarantia,
        rentaMensualIVA: op.rentaMensualIVA,
        valorResidual: op.valorResidual,
        totalPagar: op.totalPagar,
        ganancia: op.ganancia,
        descripcion: op.nombre,
      }));
    }

    const vigencia = new Date();
    vigencia.setDate(vigencia.getDate() + 30);

    const quotation = await prisma.quotation.create({
      data: {
        folio,
        clientId: data.clientId || null,
        nombreCliente: data.nombreCliente,
        userId,
        categoriaId: data.categoriaId || null,
        bienDescripcion: data.bienDescripcion,
        bienMarca: data.bienMarca,
        bienModelo: data.bienModelo,
        bienAnio: data.bienAnio,
        bienNuevo: data.bienNuevo,
        producto: data.producto,
        valorBien: data.valorBien,
        valorBienIVA: resultado.valorBienIVA,
        plazo: data.plazo,
        tasaAnual: data.tasaAnual,
        nivelRiesgo: data.nivelRiesgo,
        enganche: resultado.enganche,
        enganchePorcentaje: data.enganchePct,
        depositoGarantia: resultado.depositoGarantia,
        depositoGarantiaPct: data.depositoGarantiaPct,
        comisionApertura: resultado.comisionApertura,
        comisionAperturaPct: data.comisionAperturaPct,
        comisionAperturaFinanciada: data.comisionAperturaFinanciada,
        rentaInicial: data.rentaInicial,
        gpsInstalacion: data.gpsInstalacion,
        gpsFinanciado: data.gpsFinanciado,
        seguroAnual: data.seguroAnual,
        seguroFinanciado: data.seguroFinanciado,
        valorResidual: resultado.valorResidual,
        valorResidualPct: data.valorResidualPct,
        montoFinanciar: resultado.montoFinanciar,
        rentaMensual: resultado.rentaMensual,
        rentaMensualIVA: resultado.rentaMensualIVA,
        totalRentas: resultado.totalRentas,
        totalPagar: resultado.totalPagar,
        ganancia: resultado.ganancia,
        vigenciaHasta: vigencia,
        observaciones: data.observaciones,
        opciones: opcionesData.length > 0 ? { create: opcionesData } : undefined,
      },
      include: {
        opciones: true,
        client: { select: { id: true, rfc: true, tipo: true } },
        user: { select: { id: true, nombre: true, apellidos: true } },
      },
    });

    return res.status(201).json({
      ...quotation,
      amortizacion: resultado.amortizacion,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create quotation error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Auto-vencer cotizaciones que rebasaron vigenciaHasta (best-effort, no bloquea)
async function autoExpireQuotations(): Promise<void> {
  try {
    await prisma.quotation.updateMany({
      where: {
        estado: 'VIGENTE',
        vigenciaHasta: { lt: new Date() },
      },
      data: { estado: 'VENCIDA' },
    });
  } catch (err) {
    console.error('autoExpireQuotations error:', err);
  }
}

// GET /api/quotations - Listar cotizaciones
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await autoExpireQuotations();
    const { page = '1', limit = '20', estado, producto } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (estado) where.estado = estado;
    if (producto) where.producto = producto;

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, rfc: true, tipo: true, razonSocial: true, nombre: true, apellidoPaterno: true } },
          user: { select: { nombre: true, apellidos: true } },
          opciones: true,
          contrato: { select: { id: true, folio: true, etapa: true, estatus: true } },
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    return res.json({ data: quotations, total, page: parseInt(page as string), pages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('List quotations error:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/quotations/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    // Auto-vencer si aplica antes de devolver
    const existing = await prisma.quotation.findUnique({
      where: { id: req.params.id },
      select: { id: true, estado: true, vigenciaHasta: true },
    });
    if (
      existing &&
      existing.estado === 'VIGENTE' &&
      existing.vigenciaHasta &&
      existing.vigenciaHasta < new Date()
    ) {
      await prisma.quotation.update({
        where: { id: req.params.id },
        data: { estado: 'VENCIDA' },
      });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: req.params.id },
      include: {
        opciones: true,
        client: true,
        user: { select: { nombre: true, apellidos: true, email: true } },
        contrato: { select: { id: true, folio: true, etapa: true, estatus: true } },
      },
    });

    if (!quotation) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    // Recalcular amortización para el response
    const amortizacion = calcularArrendamiento({
      producto: quotation.producto,
      valorBien: Number(quotation.valorBien),
      plazo: quotation.plazo,
      tasaAnual: Number(quotation.tasaAnual),
      enganchePct: Number(quotation.enganchePorcentaje),
      depositoGarantiaPct: Number(quotation.depositoGarantiaPct),
      comisionAperturaPct: Number(quotation.comisionAperturaPct),
      comisionAperturaFinanciada: quotation.comisionAperturaFinanciada,
      valorResidualPct: Number(quotation.valorResidualPct),
      rentaInicial: Number(quotation.rentaInicial),
      gpsInstalacion: Number(quotation.gpsInstalacion),
      gpsFinanciado: quotation.gpsFinanciado,
      seguroAnual: Number(quotation.seguroAnual),
      seguroFinanciado: quotation.seguroFinanciado,
    }).amortizacion;

    return res.json({ ...quotation, amortizacion });
  } catch (error) {
    console.error('Get quotation error:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/quotations/simulate - Simular sin guardar
router.post('/simulate', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = quotationSchema.partial().parse(req.body);

    const resultado = calcularArrendamiento({
      producto: data.producto || 'PURO',
      valorBien: data.valorBien || 500000,
      plazo: data.plazo || 36,
      tasaAnual: data.tasaAnual || 0.36,
      enganchePct: data.enganchePct || 0,
      depositoGarantiaPct: data.depositoGarantiaPct || 0.16,
      comisionAperturaPct: data.comisionAperturaPct || 0.05,
      comisionAperturaFinanciada: data.comisionAperturaFinanciada ?? true,
      valorResidualPct: data.valorResidualPct || 0.16,
      rentaInicial: data.rentaInicial || 0,
      gpsInstalacion: data.gpsInstalacion || 4200,
      gpsFinanciado: data.gpsFinanciado ?? true,
      seguroAnual: data.seguroAnual || 0,
      seguroFinanciado: data.seguroFinanciado ?? true,
    });

    let opciones;
    if (data.generarOpciones) {
      opciones = generarOpcionesRiesgo(
        data.valorBien || 500000,
        data.plazo || 36,
        data.tasaAnual || 0.36,
        data.gpsInstalacion || 4200,
        data.comisionAperturaPct || 0.05,
      );
    }

    return res.json({ resultado, opciones });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Simulate error:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/quotations/:id/estado - Cambio manual de estado (APROBADA / RECHAZADA)
const estadoSchema = z.object({
  estado: z.enum(['APROBADA', 'RECHAZADA']),
  observaciones: z.string().optional(),
});

router.patch('/:id/estado', requireAuth, async (req: Request, res: Response) => {
  try {
    const { estado, observaciones } = estadoSchema.parse(req.body);
    const current = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Cotización no encontrada' });

    if (current.estado === 'CONVERTIDA') {
      return res.status(400).json({ error: 'La cotización ya fue convertida en contrato' });
    }
    if (current.estado === 'VENCIDA' && estado === 'APROBADA') {
      return res.status(400).json({ error: 'No se puede aprobar una cotización vencida' });
    }

    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: {
        estado,
        observaciones: observaciones ?? current.observaciones,
      },
    });

    notificar({
      tipo: estado === 'APROBADA' ? 'COTIZACION_APROBADA' : 'COTIZACION_RECHAZADA',
      titulo: `Cotización ${updated.folio} ${estado.toLowerCase()}`,
      mensaje: `${updated.nombreCliente}${observaciones ? ` — ${observaciones}` : ''}`,
      entidad: 'Quotation',
      entidadId: updated.id,
      url: `/cotizaciones/${updated.id}`,
      ejecutivoId: updated.userId,
    });

    return res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Update estado error:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/quotations/:id/convert - Convertir cotización en contrato
router.post('/:id/convert', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const quotation = await prisma.quotation.findUnique({
      where: { id: req.params.id },
      include: { contrato: { select: { id: true, folio: true } } },
    });
    if (!quotation) return res.status(404).json({ error: 'Cotización no encontrada' });

    if (quotation.contrato) {
      return res.status(400).json({
        error: `Esta cotización ya generó el contrato ${quotation.contrato.folio}`,
        contratoId: quotation.contrato.id,
      });
    }
    if (quotation.estado === 'VENCIDA') {
      return res.status(400).json({ error: 'No se puede convertir una cotización vencida' });
    }
    if (quotation.estado === 'RECHAZADA') {
      return res.status(400).json({ error: 'No se puede convertir una cotización rechazada' });
    }
    if (!quotation.clientId) {
      return res.status(400).json({
        error: 'La cotización no tiene un cliente registrado. Crea el contrato manualmente desde /contratos/nuevo.',
      });
    }
    if (!quotation.bienDescripcion) {
      return res.status(400).json({ error: 'La cotización no tiene descripción del bien' });
    }

    // Generar folio
    const year = new Date().getFullYear();
    const count = await prisma.contract.count();
    const folio = `ARR-${String(count + 1).padStart(3, '0')}-${year}`;

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          folio,
          clientId: quotation.clientId!,
          quotationId: quotation.id,
          userId,
          categoriaId: quotation.categoriaId || null,
          bienDescripcion: quotation.bienDescripcion!,
          bienMarca: quotation.bienMarca,
          bienModelo: quotation.bienModelo,
          bienAnio: quotation.bienAnio,
          bienNumSerie: quotation.bienNumSerie,
          bienEstado: quotation.bienNuevo ? 'Nuevo' : 'Seminuevo',
          producto: quotation.producto,
          valorBien: quotation.valorBien,
          valorBienIVA: quotation.valorBienIVA ?? Number(quotation.valorBien) * 1.16,
          plazo: quotation.plazo,
          tasaAnual: quotation.tasaAnual,
          nivelRiesgo: quotation.nivelRiesgo,
          enganche: quotation.enganche,
          depositoGarantia: quotation.depositoGarantia,
          comisionApertura: quotation.comisionApertura,
          rentaInicial: quotation.rentaInicial,
          gpsInstalacion: quotation.gpsInstalacion,
          seguroAnual: quotation.seguroAnual,
          valorResidual: quotation.valorResidual,
          montoFinanciar: quotation.montoFinanciar ?? 0,
          rentaMensual: quotation.rentaMensual ?? 0,
          rentaMensualIVA: quotation.rentaMensualIVA ?? 0,
          etapa: 'SOLICITUD',
          stageHistory: {
            create: {
              etapa: 'SOLICITUD',
              observacion: `Contrato creado desde cotización ${quotation.folio}`,
              usuarioId: userId,
            },
          },
        },
      });

      await tx.quotation.update({
        where: { id: quotation.id },
        data: { estado: 'CONVERTIDA' },
      });

      return created;
    });

    notificar({
      tipo: 'SOLICITUD_CREADA',
      titulo: `Nueva solicitud ${contract.folio} (desde cotización)`,
      mensaje: `${contract.bienDescripcion} por ${fmt$(contract.montoFinanciar)} — desde cotización ${quotation.folio}`,
      entidad: 'Contract',
      entidadId: contract.id,
      url: `/contratos/${contract.id}`,
      ejecutivoId: userId,
    });

    return res.status(201).json(contract);
  } catch (error) {
    console.error('Convert quotation error:', error);
    return res.status(500).json({ error: 'Error interno al convertir' });
  }
});

export default router;
