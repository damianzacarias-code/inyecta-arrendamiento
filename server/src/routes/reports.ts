import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── GET /api/reports/cartera ───────────────────────────────
// Cartera activa: contratos vigentes con saldo, días de mora, riesgo.
router.get('/cartera', requireAuth, async (_req: Request, res: Response) => {
  try {
    const contracts = await prisma.contract.findMany({
      where: { estatus: 'VIGENTE' },
      include: {
        client: {
          select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true },
        },
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: true,
      },
    });

    const now = new Date();
    const filas = contracts.map(c => {
      const totalPagado = c.pagos.reduce((s, p) => s + Number(p.montoTotal), 0);
      const totalProgramado = c.amortizacion.reduce((s, a) => s + Number(a.pagoTotal), 0);
      const saldoInsoluto = Number(c.amortizacion[0]?.saldoInicial || c.montoFinanciar);

      // Periodos vencidos (no pagados con fecha < now)
      const paymentsByPeriodo = new Map<number, number>();
      c.pagos.forEach(p => {
        if (p.periodo === null) return;
        paymentsByPeriodo.set(p.periodo, (paymentsByPeriodo.get(p.periodo) || 0) + Number(p.montoRenta) + Number(p.montoIVA));
      });
      const vencidos = c.amortizacion.filter(a => {
        const pagado = paymentsByPeriodo.get(a.periodo) || 0;
        const debido = Number(a.pagoTotal);
        return new Date(a.fechaPago) < now && pagado < debido - 0.01;
      });

      const diasMaxAtraso = vencidos.length === 0 ? 0
        : Math.max(...vencidos.map(v => Math.floor((now.getTime() - new Date(v.fechaPago).getTime()) / 86400000)));

      let bucket: 'AL_DIA' | '1_30' | '31_60' | '61_90' | '90_MAS';
      if (diasMaxAtraso === 0) bucket = 'AL_DIA';
      else if (diasMaxAtraso <= 30) bucket = '1_30';
      else if (diasMaxAtraso <= 60) bucket = '31_60';
      else if (diasMaxAtraso <= 90) bucket = '61_90';
      else bucket = '90_MAS';

      const cliente = c.client.tipo === 'PM'
        ? c.client.razonSocial
        : `${c.client.nombre || ''} ${c.client.apellidoPaterno || ''}`.trim();

      return {
        contractId: c.id,
        folio: c.folio,
        producto: c.producto,
        cliente: cliente || '—',
        rfc: c.client.rfc,
        nivelRiesgo: c.nivelRiesgo,
        plazo: c.plazo,
        rentaMensual: round2(Number(c.rentaMensual)),
        saldoInsoluto: round2(saldoInsoluto),
        totalProgramado: round2(totalProgramado),
        totalPagado: round2(totalPagado),
        periodosVencidos: vencidos.length,
        diasMaxAtraso,
        bucket,
        fechaInicio: c.fechaInicio,
        fechaVencimiento: c.fechaVencimiento,
      };
    });

    const totales = {
      contratos: filas.length,
      saldoInsolutoTotal: round2(filas.reduce((s, f) => s + f.saldoInsoluto, 0)),
      rentaMensualTotal: round2(filas.reduce((s, f) => s + f.rentaMensual, 0)),
      buckets: {
        AL_DIA: filas.filter(f => f.bucket === 'AL_DIA').length,
        b1_30: filas.filter(f => f.bucket === '1_30').length,
        b31_60: filas.filter(f => f.bucket === '31_60').length,
        b61_90: filas.filter(f => f.bucket === '61_90').length,
        b90_MAS: filas.filter(f => f.bucket === '90_MAS').length,
      },
      porProducto: {
        PURO: filas.filter(f => f.producto === 'PURO').length,
        FINANCIERO: filas.filter(f => f.producto === 'FINANCIERO').length,
      },
    };

    res.json({ totales, filas });
  } catch (err) {
    console.error('Reporte cartera error:', err);
    res.status(500).json({ error: 'Error al generar reporte de cartera' });
  }
});

// ─── GET /api/reports/cobranza-mensual ──────────────────────
// Cobranza por mes: programado vs cobrado, eficiencia.
// Query: ?year=2026 (default año actual)
router.get('/cobranza-mensual', requireAuth, async (req: Request, res: Response) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [entries, payments] = await Promise.all([
      prisma.amortizationEntry.findMany({
        where: { fechaPago: { gte: yearStart, lt: yearEnd } },
        select: { fechaPago: true, pagoTotal: true },
      }),
      prisma.payment.findMany({
        where: { fechaPago: { gte: yearStart, lt: yearEnd } },
        select: { fechaPago: true, montoTotal: true, montoMoratorio: true, montoIVAMoratorio: true },
      }),
    ]);

    const meses = Array.from({ length: 12 }, (_, m) => ({
      mes: m + 1,
      programado: 0,
      cobrado: 0,
      moratorios: 0,
      eficiencia: 0,
    }));

    entries.forEach(e => {
      const m = new Date(e.fechaPago).getMonth();
      meses[m].programado += Number(e.pagoTotal);
    });
    payments.forEach(p => {
      const m = new Date(p.fechaPago).getMonth();
      meses[m].cobrado += Number(p.montoTotal);
      meses[m].moratorios += Number(p.montoMoratorio) + Number(p.montoIVAMoratorio);
    });

    meses.forEach(m => {
      m.programado = round2(m.programado);
      m.cobrado = round2(m.cobrado);
      m.moratorios = round2(m.moratorios);
      m.eficiencia = m.programado > 0 ? round2((m.cobrado / m.programado) * 100) : 0;
    });

    const totales = {
      programadoAnual: round2(meses.reduce((s, m) => s + m.programado, 0)),
      cobradoAnual: round2(meses.reduce((s, m) => s + m.cobrado, 0)),
      moratoriosAnual: round2(meses.reduce((s, m) => s + m.moratorios, 0)),
    };
    const eficienciaAnual = totales.programadoAnual > 0
      ? round2((totales.cobradoAnual / totales.programadoAnual) * 100)
      : 0;

    res.json({ year, meses, totales, eficienciaAnual });
  } catch (err) {
    console.error('Reporte cobranza mensual error:', err);
    res.status(500).json({ error: 'Error al generar reporte mensual' });
  }
});

// ─── GET /api/reports/rentabilidad ──────────────────────────
// Rentabilidad por contrato: intereses devengados, comisiones, etc.
router.get('/rentabilidad', requireAuth, async (_req: Request, res: Response) => {
  try {
    const contracts = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'TERMINADO'] } },
      include: {
        client: {
          select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true },
        },
        amortizacion: { select: { intereses: true, pagoCapital: true } },
      },
    });

    const filas = contracts.map(c => {
      const interesesProgramados = c.amortizacion.reduce((s, a) => s + Number(a.intereses || 0), 0);
      const monto = Number(c.montoFinanciar);
      const tasaAnual = Number(c.tasaAnual);
      const comision = Number(c.comisionApertura);
      const ingresoTotal = interesesProgramados + comision;
      const cliente = c.client.tipo === 'PM'
        ? c.client.razonSocial
        : `${c.client.nombre || ''} ${c.client.apellidoPaterno || ''}`.trim();

      return {
        contractId: c.id,
        folio: c.folio,
        producto: c.producto,
        cliente: cliente || '—',
        montoFinanciado: round2(monto),
        tasaAnual,
        plazo: c.plazo,
        interesesProgramados: round2(interesesProgramados),
        comisionApertura: round2(comision),
        ingresoTotalEstimado: round2(ingresoTotal),
        rendimientoSobreMonto: monto > 0 ? round2((ingresoTotal / monto) * 100) : 0,
        estatus: c.estatus,
      };
    });

    const totales = {
      contratos: filas.length,
      montoFinanciadoTotal: round2(filas.reduce((s, f) => s + f.montoFinanciado, 0)),
      interesesTotales: round2(filas.reduce((s, f) => s + f.interesesProgramados, 0)),
      comisionesTotales: round2(filas.reduce((s, f) => s + f.comisionApertura, 0)),
      ingresoTotal: round2(filas.reduce((s, f) => s + f.ingresoTotalEstimado, 0)),
    };

    res.json({ totales, filas });
  } catch (err) {
    console.error('Reporte rentabilidad error:', err);
    res.status(500).json({ error: 'Error al generar reporte de rentabilidad' });
  }
});

export default router;
