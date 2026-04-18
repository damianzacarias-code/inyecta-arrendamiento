import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();
const IVA = 0.16;

// ─── Helpers ────────────────────────────────────────────────

/** Calcula moratorio con fórmula: saldoVencido × (tasaAnual×2 / 360) × díasAtraso */
function calcMoratorio(saldoVencido: number, tasaAnual: number, diasAtraso: number) {
  if (diasAtraso <= 0) return 0;
  const tasaMoratoria = Number(tasaAnual) * 2;
  const tasaDiaria = tasaMoratoria / 360;
  return Math.round(saldoVencido * tasaDiaria * diasAtraso * 100) / 100;
}

/** Calcula el desglose de conceptos para un periodo considerando pagos parciales */
function calcConceptos(
  entry: {
    periodo: number;
    fechaPago: Date;
    renta: any;
    iva: any;
    pagoTotal: any;
    saldoInicial: any;
    saldoFinal: any;
    intereses?: any;
    pagoCapital?: any;
  },
  tasaAnual: number,
  payments: Array<{
    montoRenta: any;
    montoIVA: any;
    montoMoratorio: any;
    montoIVAMoratorio: any;
    montoTotal: any;
    fechaPago: Date;
    referencia: string | null;
    id: string;
    diasAtraso: number;
  }>,
  fechaCorte: Date
) {
  const renta = Number(entry.renta);
  const ivaRenta = Number(entry.iva);
  const pagoTotal = Number(entry.pagoTotal); // renta + IVA (seguro incluido en monto financiado)

  // Sumas de lo ya pagado por concepto
  const pagadoRenta = payments.reduce((s, p) => s + Number(p.montoRenta), 0);
  const pagadoIVA = payments.reduce((s, p) => s + Number(p.montoIVA), 0);
  const pagadoMoratorio = payments.reduce((s, p) => s + Number(p.montoMoratorio), 0);
  const pagadoIVAMoratorio = payments.reduce((s, p) => s + Number(p.montoIVAMoratorio), 0);
  const pagadoTotal = payments.reduce((s, p) => s + Number(p.montoTotal), 0);

  // Renta pendiente (lo que falta por cubrir de la renta del periodo)
  const rentaPendiente = Math.max(0, Math.round((renta - pagadoRenta) * 100) / 100);
  const ivaPendiente = Math.max(0, Math.round((ivaRenta - pagadoIVA) * 100) / 100);
  const rentaTotalPendiente = Math.round((rentaPendiente + ivaPendiente) * 100) / 100;

  // ¿Está cubierta la renta completa?
  const rentaCubierta = rentaPendiente <= 0.01 && ivaPendiente <= 0.01;

  // Estado del periodo
  const vencimiento = new Date(entry.fechaPago);
  const isOverdue = !rentaCubierta && vencimiento < fechaCorte;
  const diasAtraso = isOverdue
    ? Math.floor((fechaCorte.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Moratorio sobre saldo vencido (renta pendiente + IVA pendiente)
  const moratorioGenerado = isOverdue
    ? calcMoratorio(rentaTotalPendiente, tasaAnual, diasAtraso)
    : 0;
  const ivaMoratorioGenerado = Math.round(moratorioGenerado * IVA * 100) / 100;

  // Moratorio pendiente de pago
  const moratorioPendiente = Math.max(0, Math.round((moratorioGenerado - pagadoMoratorio) * 100) / 100);
  const ivaMoratorioPendiente = Math.max(0, Math.round((ivaMoratorioGenerado - pagadoIVAMoratorio) * 100) / 100);

  // Total adeudado
  const totalAdeudado = Math.round(
    (rentaTotalPendiente + moratorioPendiente + ivaMoratorioPendiente) * 100
  ) / 100;

  // Determinar estatus
  let estatus: 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'PENDIENTE' | 'FUTURO';
  if (rentaCubierta && moratorioPendiente <= 0.01) {
    estatus = 'PAGADO';
  } else if (pagadoTotal > 0 && !rentaCubierta) {
    estatus = 'PARCIAL';
  } else if (isOverdue) {
    estatus = 'VENCIDO';
  } else if (vencimiento <= fechaCorte) {
    estatus = 'PENDIENTE';
  } else {
    estatus = 'FUTURO';
  }

  return {
    periodo: entry.periodo,
    fechaPago: entry.fechaPago,
    estatus,
    diasAtraso,

    // Conceptos originales
    renta,
    ivaRenta,
    pagoTotal,
    saldoInicial: Number(entry.saldoInicial),
    saldoFinal: Number(entry.saldoFinal),
    intereses: Number(entry.intereses || 0),
    pagoCapital: Number(entry.pagoCapital || 0),

    // Moratorios generados
    moratorio: {
      generado: moratorioGenerado,
      ivaGenerado: ivaMoratorioGenerado,
      pagado: Math.round(pagadoMoratorio * 100) / 100,
      ivaPagado: Math.round(pagadoIVAMoratorio * 100) / 100,
      pendiente: moratorioPendiente,
      ivaPendiente: ivaMoratorioPendiente,
    },

    // Desglose de saldos
    desglose: {
      rentaPendiente,
      ivaPendiente,
      rentaTotalPendiente,
      moratorioPendiente,
      ivaMoratorioPendiente,
      totalAdeudado,
    },

    // Pagos aplicados
    pagos: {
      cantidad: payments.length,
      totalPagado: Math.round(pagadoTotal * 100) / 100,
      pagadoRenta: Math.round(pagadoRenta * 100) / 100,
      pagadoIVA: Math.round(pagadoIVA * 100) / 100,
      pagadoMoratorio: Math.round(pagadoMoratorio * 100) / 100,
      pagadoIVAMoratorio: Math.round(pagadoIVAMoratorio * 100) / 100,
      detalle: payments.map(p => ({
        id: p.id,
        fecha: p.fechaPago,
        monto: Number(p.montoTotal),
        referencia: p.referencia,
      })),
    },
  };
}

// ─── GET /api/cobranza/calendar ─────────────────────────────
router.get('/calendar', requireAuth, async (req: Request, res: Response) => {
  try {
    const { month, year, status } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year as string) : now.getFullYear();
    const targetMonth = month ? parseInt(month as string) - 1 : now.getMonth();
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    // Todos los periodos del mes
    const entries = await prisma.amortizationEntry.findMany({
      where: {
        fechaPago: { gte: startDate, lte: endDate },
        contract: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      },
      include: {
        contract: {
          select: {
            id: true, folio: true, producto: true, nivelRiesgo: true,
            tasaAnual: true, tasaMoratoria: true,
            client: {
              select: {
                id: true, tipo: true, nombre: true, apellidoPaterno: true,
                razonSocial: true, rfc: true, telefono: true, email: true,
              },
            },
          },
        },
      },
      orderBy: { fechaPago: 'asc' },
    });

    // Pagos del mes para esos contratos
    const contractIds = [...new Set(entries.map(e => e.contractId))];
    const payments = await prisma.payment.findMany({
      where: {
        contractId: { in: contractIds },
        periodo: { in: entries.map(e => e.periodo) },
      },
    });

    // Agrupar pagos por contrato-periodo (puede haber múltiples pagos parciales)
    const paymentsByKey = new Map<string, typeof payments>();
    payments.forEach(p => {
      const key = `${p.contractId}-${p.periodo}`;
      if (!paymentsByKey.has(key)) paymentsByKey.set(key, []);
      paymentsByKey.get(key)!.push(p);
    });

    // Enriquecer cada periodo
    const enriched = entries.map(entry => {
      const key = `${entry.contractId}-${entry.periodo}`;
      const periodPayments = paymentsByKey.get(key) || [];
      const tasaAnual = Number(entry.contract.tasaAnual);

      const conceptos = calcConceptos(entry, tasaAnual, periodPayments, now);

      return {
        id: entry.id,
        contractId: entry.contractId,
        contract: entry.contract,
        ...conceptos,
      };
    });

    // Filtrar por estatus
    let filtered = enriched;
    if (status === 'pendiente') filtered = enriched.filter(e => e.estatus === 'PENDIENTE' || e.estatus === 'PARCIAL');
    if (status === 'vencido') filtered = enriched.filter(e => e.estatus === 'VENCIDO' || e.estatus === 'PARCIAL');
    if (status === 'pagado') filtered = enriched.filter(e => e.estatus === 'PAGADO');

    // Resumen
    const vencidos = enriched.filter(e => e.estatus === 'VENCIDO' || (e.estatus === 'PARCIAL' && e.diasAtraso > 0));
    const summary = {
      total: enriched.length,
      pendientes: enriched.filter(e => e.estatus === 'PENDIENTE' || e.estatus === 'FUTURO').length,
      parciales: enriched.filter(e => e.estatus === 'PARCIAL').length,
      vencidos: vencidos.length,
      pagados: enriched.filter(e => e.estatus === 'PAGADO').length,
      totalPendiente: Math.round(enriched.filter(e => e.estatus !== 'PAGADO').reduce((s, e) => s + e.desglose.rentaTotalPendiente, 0) * 100) / 100,
      totalVencido: Math.round(vencidos.reduce((s, e) => s + e.desglose.rentaTotalPendiente, 0) * 100) / 100,
      totalMoratorio: Math.round(vencidos.reduce((s, e) => s + e.desglose.moratorioPendiente + e.desglose.ivaMoratorioPendiente, 0) * 100) / 100,
      totalAdeudado: Math.round(enriched.filter(e => e.estatus !== 'PAGADO').reduce((s, e) => s + e.desglose.totalAdeudado, 0) * 100) / 100,
      totalPagado: Math.round(enriched.reduce((s, e) => s + e.pagos.totalPagado, 0) * 100) / 100,
    };

    res.json({ month: targetMonth + 1, year: targetYear, data: filtered, summary });
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ error: 'Error al obtener calendario' });
  }
});

// ─── GET /api/cobranza/contract/:contractId ─────────────────
router.get('/contract/:contractId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: {
          select: {
            id: true, tipo: true, nombre: true, apellidoPaterno: true,
            razonSocial: true, rfc: true, telefono: true, email: true,
          },
        },
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: { orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const now = new Date();
    const tasaAnual = Number(contract.tasaAnual);

    // Agrupar pagos por periodo
    const paymentsByPeriodo = new Map<number, typeof contract.pagos>();
    contract.pagos.forEach(p => {
      if (p.periodo === null) return;
      if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
      paymentsByPeriodo.get(p.periodo)!.push(p);
    });

    const schedule = contract.amortizacion.map(entry => {
      const periodPayments = paymentsByPeriodo.get(entry.periodo) || [];
      return calcConceptos(entry, tasaAnual, periodPayments, now);
    });

    // Totales acumulados
    const totalPagadoRenta = schedule.reduce((s, e) => s + e.pagos.pagadoRenta, 0);
    const totalPagadoIVA = schedule.reduce((s, e) => s + e.pagos.pagadoIVA, 0);
    const totalPagadoMoratorio = schedule.reduce((s, e) => s + e.pagos.pagadoMoratorio + e.pagos.pagadoIVAMoratorio, 0);
    const totalPagado = schedule.reduce((s, e) => s + e.pagos.totalPagado, 0);

    const totalRentaPendiente = schedule.reduce((s, e) => s + e.desglose.rentaTotalPendiente, 0);
    const totalMoratorioPendiente = schedule.reduce((s, e) => s + e.desglose.moratorioPendiente + e.desglose.ivaMoratorioPendiente, 0);
    const totalAdeudado = schedule.reduce((s, e) => s + e.desglose.totalAdeudado, 0);

    res.json({
      contract: {
        id: contract.id,
        folio: contract.folio,
        producto: contract.producto,
        plazo: contract.plazo,
        tasaAnual: contract.tasaAnual,
        tasaMoratoria: Number(contract.tasaAnual) * 2,
        rentaMensual: contract.rentaMensual,
        rentaMensualIVA: contract.rentaMensualIVA,
        montoFinanciar: contract.montoFinanciar,
        fechaInicio: contract.fechaInicio,
        fechaVencimiento: contract.fechaVencimiento,
        estatus: contract.estatus,
        client: contract.client,
      },
      schedule,
      summary: {
        totalPeriodos: schedule.length,
        pagados: schedule.filter(s => s.estatus === 'PAGADO').length,
        parciales: schedule.filter(s => s.estatus === 'PARCIAL').length,
        pendientes: schedule.filter(s => s.estatus === 'PENDIENTE' || s.estatus === 'FUTURO').length,
        vencidos: schedule.filter(s => s.estatus === 'VENCIDO').length,
        // Desglose de pagado
        totalPagado: Math.round(totalPagado * 100) / 100,
        pagadoRenta: Math.round(totalPagadoRenta * 100) / 100,
        pagadoIVA: Math.round(totalPagadoIVA * 100) / 100,
        pagadoMoratorio: Math.round(totalPagadoMoratorio * 100) / 100,
        // Desglose de pendiente
        totalRentaPendiente: Math.round(totalRentaPendiente * 100) / 100,
        totalMoratorioPendiente: Math.round(totalMoratorioPendiente * 100) / 100,
        totalAdeudado: Math.round(totalAdeudado * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Contract schedule error:', error);
    res.status(500).json({ error: 'Error al obtener tabla de pagos' });
  }
});

// ─── POST /api/cobranza/pay ─────────────────────────────────
// Registra un pago (total o parcial) para un periodo.
// Orden de aplicación: moratorios (+IVA) → renta (+IVA)
const paySchema = z.object({
  contractId: z.string().min(1),
  periodo: z.number().int().positive(),
  monto: z.number().positive(),
  fechaPago: z.string().optional(),
  referencia: z.string().optional(),
  observaciones: z.string().optional(),
});

router.post('/pay', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = paySchema.parse(req.body);

    // Obtener el periodo de amortización
    const entry = await prisma.amortizationEntry.findFirst({
      where: { contractId: data.contractId, periodo: data.periodo },
      include: {
        contract: { select: { tasaAnual: true, tasaMoratoria: true } },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Periodo no encontrado' });

    // Obtener pagos previos del periodo
    const prevPayments = await prisma.payment.findMany({
      where: { contractId: data.contractId, periodo: data.periodo },
    });

    const now = new Date();
    const tasaAnual = Number(entry.contract.tasaAnual);

    // Calcular estado actual del periodo
    const conceptos = calcConceptos(entry, tasaAnual, prevPayments, now);

    if (conceptos.estatus === 'PAGADO') {
      return res.status(400).json({ error: 'Este periodo ya está completamente pagado' });
    }

    // Aplicar pago en orden: moratorios (+IVA) → renta (+IVA)
    let restante = data.monto;

    // 1. Moratorios pendientes
    let aplicadoMoratorio = 0;
    let aplicadoIVAMoratorio = 0;
    if (conceptos.desglose.moratorioPendiente > 0 && restante > 0) {
      aplicadoMoratorio = Math.min(restante, conceptos.desglose.moratorioPendiente);
      restante -= aplicadoMoratorio;
      // IVA del moratorio
      const ivaDelMoratorio = Math.round(aplicadoMoratorio * IVA * 100) / 100;
      aplicadoIVAMoratorio = Math.min(restante, Math.min(ivaDelMoratorio, conceptos.desglose.ivaMoratorioPendiente));
      restante -= aplicadoIVAMoratorio;
    }

    // 2. Renta pendiente
    let aplicadoRenta = 0;
    let aplicadoIVARenta = 0;
    if (conceptos.desglose.rentaPendiente > 0 && restante > 0) {
      aplicadoRenta = Math.min(restante, conceptos.desglose.rentaPendiente);
      restante -= aplicadoRenta;
      // IVA de la renta
      if (conceptos.desglose.ivaPendiente > 0 && restante > 0) {
        aplicadoIVARenta = Math.min(restante, conceptos.desglose.ivaPendiente);
        restante -= aplicadoIVARenta;
      }
    }

    const montoTotal = aplicadoMoratorio + aplicadoIVAMoratorio + aplicadoRenta + aplicadoIVARenta;

    if (montoTotal <= 0) {
      return res.status(400).json({ error: 'El monto no alcanza para cubrir ningún concepto' });
    }

    // Calcular días de atraso al momento del pago
    const vencimiento = new Date(entry.fechaPago);
    const diasAtraso = vencimiento < now
      ? Math.floor((now.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Determinar tipo de pago
    const rentaTotalDespuesDePago = conceptos.desglose.rentaPendiente - aplicadoRenta;
    const esParcial = rentaTotalDespuesDePago > 0.01;

    const payment = await prisma.payment.create({
      data: {
        contractId: data.contractId,
        userId,
        periodo: data.periodo,
        tipo: esParcial ? 'RENTA_ORDINARIA' : 'RENTA_ORDINARIA',
        fechaPago: data.fechaPago ? new Date(data.fechaPago) : now,
        fechaVencimiento: vencimiento,
        montoRenta: Math.round(aplicadoRenta * 100) / 100,
        montoIVA: Math.round(aplicadoIVARenta * 100) / 100,
        montoMoratorio: Math.round(aplicadoMoratorio * 100) / 100,
        montoIVAMoratorio: Math.round(aplicadoIVAMoratorio * 100) / 100,
        montoTotal: Math.round(montoTotal * 100) / 100,
        diasAtraso,
        referencia: data.referencia || null,
        observaciones: data.observaciones || (esParcial ? 'Pago parcial' : restante > 0.01 ? `Sobrante: $${restante.toFixed(2)}` : null),
      },
    });

    // Responder con el desglose actualizado
    const updatedPayments = [...prevPayments, payment];
    const updatedConceptos = calcConceptos(entry, tasaAnual, updatedPayments, now);

    res.json({
      payment,
      aplicacion: {
        moratorio: aplicadoMoratorio,
        ivaMoratorio: aplicadoIVAMoratorio,
        renta: aplicadoRenta,
        ivaRenta: aplicadoIVARenta,
        total: montoTotal,
        sobrante: Math.round(restante * 100) / 100,
      },
      estadoPeriodo: updatedConceptos,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
});

// ─── POST /api/cobranza/pay-advance ─────────────────────────
// Registra pago de periodos futuros (adelantado)
const payAdvanceSchema = z.object({
  contractId: z.string().min(1),
  periodos: z.array(z.number().int().positive()).min(1),
  fechaPago: z.string().optional(),
  referencia: z.string().optional(),
  observaciones: z.string().optional(),
});

router.post('/pay-advance', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = payAdvanceSchema.parse(req.body);

    // Obtener los periodos
    const entries = await prisma.amortizationEntry.findMany({
      where: { contractId: data.contractId, periodo: { in: data.periodos } },
      orderBy: { periodo: 'asc' },
    });

    if (entries.length !== data.periodos.length) {
      return res.status(400).json({ error: 'Algunos periodos no existen' });
    }

    // Verificar que no estén ya pagados
    const existingPayments = await prisma.payment.findMany({
      where: { contractId: data.contractId, periodo: { in: data.periodos } },
    });

    // Agrupar pagos por periodo
    const paymentsByPeriodo = new Map<number, typeof existingPayments>();
    existingPayments.forEach(p => {
      if (p.periodo === null) return;
      if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
      paymentsByPeriodo.get(p.periodo)!.push(p);
    });

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      select: { tasaAnual: true },
    });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const now = new Date();
    const tasaAnual = Number(contract.tasaAnual);

    const results = [];
    for (const entry of entries) {
      const periodPayments = paymentsByPeriodo.get(entry.periodo) || [];
      const conceptos = calcConceptos(entry, tasaAnual, periodPayments, now);

      if (conceptos.estatus === 'PAGADO') continue;

      // Pago adelantado cubre el total adeudado
      const montoRenta = conceptos.desglose.rentaPendiente;
      const montoIVA = conceptos.desglose.ivaPendiente;
      const montoMoratorio = conceptos.desglose.moratorioPendiente;
      const montoIVAMoratorio = conceptos.desglose.ivaMoratorioPendiente;
      const montoTotal = conceptos.desglose.totalAdeudado;

      const payment = await prisma.payment.create({
        data: {
          contractId: data.contractId,
          userId,
          periodo: entry.periodo,
          tipo: 'RENTA_ADELANTADA',
          fechaPago: data.fechaPago ? new Date(data.fechaPago) : now,
          fechaVencimiento: entry.fechaPago,
          montoRenta: Math.round(montoRenta * 100) / 100,
          montoIVA: Math.round(montoIVA * 100) / 100,
          montoMoratorio: Math.round(montoMoratorio * 100) / 100,
          montoIVAMoratorio: Math.round(montoIVAMoratorio * 100) / 100,
          montoTotal: Math.round(montoTotal * 100) / 100,
          diasAtraso: conceptos.diasAtraso,
          referencia: data.referencia || null,
          observaciones: data.observaciones || 'Pago adelantado',
        },
      });

      results.push({ periodo: entry.periodo, payment });
    }

    res.json({
      pagados: results.length,
      totalPagado: Math.round(results.reduce((s, r) => s + Number(r.payment.montoTotal), 0) * 100) / 100,
      detalle: results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Advance payment error:', error);
    res.status(500).json({ error: 'Error al registrar pagos adelantados' });
  }
});

// ─── GET /api/cobranza/estado-cuenta/:contractId ────────────
// Estado de cuenta consolidado: todos los saldos desglosados
router.get('/estado-cuenta/:contractId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: {
          select: {
            id: true, tipo: true, nombre: true, apellidoPaterno: true,
            razonSocial: true, rfc: true, telefono: true, email: true,
          },
        },
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: { orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const now = new Date();
    const tasaAnual = Number(contract.tasaAnual);

    // Agrupar pagos por periodo
    const paymentsByPeriodo = new Map<number, typeof contract.pagos>();
    contract.pagos.forEach(p => {
      if (p.periodo === null) return;
      if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
      paymentsByPeriodo.get(p.periodo)!.push(p);
    });

    const periodos = contract.amortizacion.map(entry => {
      const periodPayments = paymentsByPeriodo.get(entry.periodo) || [];
      return calcConceptos(entry, tasaAnual, periodPayments, now);
    });

    // Solo periodos con adeudo (vencidos, parciales, pendiente actual)
    const conAdeudo = periodos.filter(p =>
      p.estatus === 'VENCIDO' || p.estatus === 'PARCIAL' || p.estatus === 'PENDIENTE'
    );

    // Resumen del estado de cuenta
    const totalRentaVencida = conAdeudo
      .filter(p => p.estatus === 'VENCIDO' || p.estatus === 'PARCIAL')
      .reduce((s, p) => s + p.desglose.rentaTotalPendiente, 0);
    const totalMoratorio = conAdeudo.reduce((s, p) => s + p.desglose.moratorioPendiente + p.desglose.ivaMoratorioPendiente, 0);
    const totalRentaPendiente = conAdeudo
      .filter(p => p.estatus === 'PENDIENTE')
      .reduce((s, p) => s + p.desglose.rentaTotalPendiente, 0);
    const totalAdeudo = conAdeudo.reduce((s, p) => s + p.desglose.totalAdeudado, 0);

    res.json({
      fechaCorte: now.toISOString(),
      contrato: {
        folio: contract.folio,
        producto: contract.producto,
        plazo: contract.plazo,
        tasaAnual: Number(contract.tasaAnual),
        tasaMoratoria: Number(contract.tasaAnual) * 2,
        client: contract.client,
      },
      resumen: {
        rentaVencida: Math.round(totalRentaVencida * 100) / 100,
        moratorios: Math.round(totalMoratorio * 100) / 100,
        rentaPendiente: Math.round(totalRentaPendiente * 100) / 100,
        totalAdeudo: Math.round(totalAdeudo * 100) / 100,
        periodosVencidos: conAdeudo.filter(p => p.estatus === 'VENCIDO').length,
        periodosParciales: conAdeudo.filter(p => p.estatus === 'PARCIAL').length,
      },
      periodos: conAdeudo,
    });
  } catch (error) {
    console.error('Estado cuenta error:', error);
    res.status(500).json({ error: 'Error al generar estado de cuenta' });
  }
});

// ─── POST /api/cobranza/pay-anticipado ──────────────────────
// STUB: Pago anticipado / liquidación anticipada
// TODO: Implementar fórmulas específicas para arrendamiento
router.post('/pay-anticipado', requireAuth, async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Funcionalidad de pago anticipado pendiente de implementar',
    nota: 'Las fórmulas de liquidación anticipada para arrendamiento se definirán próximamente',
  });
});

// ─── POST /api/cobranza/seed-amortization ───────────────────
router.post('/seed-amortization', requireAuth, async (req: Request, res: Response) => {
  try {
    const contracts = await prisma.contract.findMany({
      where: { estatus: 'VIGENTE' },
      include: { amortizacion: { take: 1 } },
    });

    const missing = contracts.filter(c => c.amortizacion.length === 0);
    const results = [];

    for (const contract of missing) {
      const fechaInicio = contract.fechaInicio || new Date();
      const tasaMensual = Number(contract.tasaAnual) / 12;
      const monto = Number(contract.montoFinanciar);
      const plazo = contract.plazo;
      const isPuro = contract.producto === 'PURO';

      let rentaBase: number;
      if (tasaMensual === 0) rentaBase = monto / plazo;
      else rentaBase = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);

      const entries = [];
      let saldo = monto;
      for (let i = 1; i <= plazo; i++) {
        const fechaPago = new Date(fechaInicio);
        fechaPago.setMonth(fechaPago.getMonth() + i);
        const interes = saldo * tasaMensual;
        const capital = isPuro ? 0 : rentaBase - interes;
        const renta = rentaBase;
        const iva = renta * 0.16;
        const pagoTotal = renta + iva;
        const saldoFinal = isPuro ? saldo : Math.max(0, saldo - capital);

        entries.push({
          contractId: contract.id,
          periodo: i,
          fechaPago,
          saldoInicial: Math.round(saldo * 100) / 100,
          intereses: Math.round(interes * 100) / 100,
          pagoCapital: Math.round(capital * 100) / 100,
          renta: Math.round(renta * 100) / 100,
          iva: Math.round(iva * 100) / 100,
          seguro: 0,
          pagoTotal: Math.round(pagoTotal * 100) / 100,
          saldoFinal: Math.round(saldoFinal * 100) / 100,
        });
        saldo = saldoFinal;
      }

      await prisma.amortizationEntry.createMany({ data: entries });

      await prisma.contract.update({
        where: { id: contract.id },
        data: { fechaVencimiento: entries[entries.length - 1].fechaPago },
      });

      results.push({ folio: contract.folio, entries: entries.length });
    }

    res.json({ seeded: results.length, contracts: results });
  } catch (error) {
    console.error('Seed amortization error:', error);
    res.status(500).json({ error: 'Error al generar amortizacion' });
  }
});

// ─── DELETE /api/cobranza/payment/:id ───────────────────────
// Cancelar un pago (para correcciones)
router.delete('/payment/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    await prisma.payment.delete({ where: { id: req.params.id } });
    res.json({ ok: true, deleted: payment });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: 'Error al cancelar pago' });
  }
});

export default router;
