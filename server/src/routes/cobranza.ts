import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { notificar, notificarPorRol } from '../lib/notificar';
import { childLogger } from '../lib/logger';
import { serializableTransaction } from '../lib/serializableTransaction';

const log = childLogger('cobranza');

const router = Router();
const IVA = 0.16;

/** Devuelve un nombre legible del cliente: razón social (PM) o "nombre apellido" (PF). */
function nombreCliente(c: { tipo: string; nombre?: string | null; apellidoPaterno?: string | null; razonSocial?: string | null } | null | undefined): string {
  if (!c) return 'cliente';
  if (c.tipo === 'PM') return c.razonSocial || 'cliente';
  return `${c.nombre || ''} ${c.apellidoPaterno || ''}`.trim() || 'cliente';
}

/** Formatea un monto como moneda MXN sin depender de Intl en el server.
 *  Acepta number, string o Decimal de Prisma. */
function fmt$(n: number | string | { toString(): string }): string {
  const num = typeof n === 'number' ? n : Number(n.toString());
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Calcula moratorio del periodo en mora (CLAUDE.md §4.9).
 *
 * Base: **renta pendiente SIN IVA** del periodo en mora (NO saldo
 * insoluto general). Tasa: 2× la tasa ordinaria del contrato.
 *
 *   tasaMoratoriaAnual  = tasaAnual × 2
 *   tasaMoratoriaDiaria = tasaMoratoriaAnual / 360
 *   moratorio           = rentaPendienteSinIVA × tasaMoratoriaDiaria × diasAtraso
 */
function calcMoratorio(rentaPendienteSinIVA: number, tasaAnual: number, diasAtraso: number) {
  if (diasAtraso <= 0) return 0;
  const tasaMoratoria = Number(tasaAnual) * 2;
  const tasaDiaria = tasaMoratoria / 360;
  return Math.round(rentaPendienteSinIVA * tasaDiaria * diasAtraso * 100) / 100;
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

  // Moratorio sobre la renta pendiente SIN IVA del periodo en mora
  // (CLAUDE.md §4.9). Base = `rentaPendiente`, NO `rentaTotalPendiente`.
  const moratorioGenerado = isOverdue
    ? calcMoratorio(rentaPendiente, tasaAnual, diasAtraso)
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
    log.error({ err: error }, 'Calendar error');
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
    log.error({ err: error }, 'Contract schedule error');
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

/**
 * Reparte `cash` entre (principal, iva) en proporción a sus saldos pendientes.
 * Hoisted al top-level (antes vivía dentro del handler) porque la lógica del
 * handler ahora corre dentro de un transaction callback y prefiero no
 * recrear la función por request.
 */
function splitProporcional(cash: number, principalPendiente: number, ivaPendiente: number) {
  const totalBucket = principalPendiente + ivaPendiente;
  if (totalBucket <= 0.005 || cash <= 0) return { aPrincipal: 0, aIva: 0, used: 0 };
  const aplica = Math.min(cash, totalBucket);
  // Si no hay IVA pendiente, todo va a principal (evita división y deja saldo limpio).
  if (ivaPendiente <= 0.005) return { aPrincipal: round2(aplica), aIva: 0, used: round2(aplica) };
  if (principalPendiente <= 0.005) return { aPrincipal: 0, aIva: round2(aplica), used: round2(aplica) };
  // Split proporcional
  const aPrincipalRaw = aplica * (principalPendiente / totalBucket);
  const aPrincipal = round2(aPrincipalRaw);
  const aIva       = round2(aplica - aPrincipal); // residuo de redondeo cae en IVA
  return { aPrincipal, aIva, used: round2(aPrincipal + aIva) };
}

/**
 * Resultado del cálculo + creación de un pago dentro de la transacción
 * serializable. Discriminated union para que el handler enrute la respuesta
 * sin tener que usar throws como control de flujo.
 */
type PayTxResult =
  | {
      ok: true;
      payment: Awaited<ReturnType<typeof prisma.payment.create>>;
      entry: NonNullable<Awaited<ReturnType<typeof prisma.amortizationEntry.findFirst>>> & {
        contract: {
          tasaAnual: any;
          tasaMoratoria: any;
          folio: string;
          userId: string;
          client: { tipo: string; nombre: string | null; apellidoPaterno: string | null; razonSocial: string | null } | null;
        };
      };
      prevPayments: Awaited<ReturnType<typeof prisma.payment.findMany>>;
      tasaAnual: number;
      now: Date;
      aplicado: { moratorio: number; ivaMoratorio: number; renta: number; ivaRenta: number; total: number };
      esParcial: boolean;
      restante: number;
    }
  | { ok: false; status: number; error: string };

router.post('/pay', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = paySchema.parse(req.body);

    // ──────────────────────────────────────────────────────────────────
    // Sección crítica: lectura del estado + cálculo de distribución +
    // creación del Payment se ejecutan en la MISMA transacción con
    // isolation level Serializable. Esto cierra la race condition
    // identificada en docs/cobranza_overview.md (§4 BUG #1):
    //
    //   ANTES (bug):
    //     T1 lee prevPayments=[]   T2 lee prevPayments=[]
    //     T1 calcula split sobre []     T2 idem
    //     T1 INSERT Payment              T2 INSERT Payment   ← doble cobro
    //
    //   AHORA:
    //     Postgres detecta read-write skew entre T1 y T2 y aborta a la
    //     perdedora con 40001 (P2034). serializableTransaction reintenta
    //     hasta 3× con backoff; el reintento ya ve el Payment de T1 y
    //     calcula sobre el estado correcto.
    //
    // Las notificaciones (notificar/notificarPorRol) y el res.json
    // viven FUERA del bloque. Llamadas a side-effects (email, SMTP)
    // dentro de una TX que reintenta se duplicarían; siempre fuera.
    // ──────────────────────────────────────────────────────────────────
    const result: PayTxResult = await serializableTransaction(
      async (tx) => {
        // Advisory lock por (contractId, periodo): serializa accesos a este
        // periodo específico. Sin esto, Postgres SSI no detecta conflicto
        // cuando ambas TXs leen prevPayments=[] (set vacío → no hay
        // predicate lock efectivo) y ambas insertan un Payment nuevo.
        // Con el lock, la 2da TX ESPERA a que la 1ra commit-ee, lo que la
        // hace ver el Payment recién creado y devolver "ya pagado".
        // pg_advisory_xact_lock se libera automáticamente al fin de la TX.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.contractId})::int4, ${data.periodo}::int4)`;

        // Obtener el periodo de amortización
        const entry = await tx.amortizationEntry.findFirst({
          where: { contractId: data.contractId, periodo: data.periodo },
          include: {
            contract: {
              select: {
                tasaAnual: true,
                tasaMoratoria: true,
                folio: true,
                userId: true,
                client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
              },
            },
          },
        });
        if (!entry) {
          return { ok: false, status: 404, error: 'Periodo no encontrado' } as const;
        }

        // Obtener pagos previos DENTRO de la TX para que el snapshot quede
        // sujeto al control de Serializable (sin esto, dos TXs leerían los
        // mismos prevPayments y la detección de conflicto no se dispararía).
        const prevPayments = await tx.payment.findMany({
          where: { contractId: data.contractId, periodo: data.periodo },
        });

        const now = new Date();
        const tasaAnual = Number(entry.contract.tasaAnual);

        const conceptos = calcConceptos(entry, tasaAnual, prevPayments, now);

        if (conceptos.estatus === 'PAGADO') {
          return { ok: false, status: 400, error: 'Este periodo ya está completamente pagado' } as const;
        }

        // Aplicar pago: prelación legal (moratorio → renta), pero DENTRO de
        // cada bucket el efectivo se reparte PROPORCIONAL entre principal
        // e IVA. Si el bucket no tiene IVA pendiente, todo va al principal.
        let restante = data.monto;

        // 1. Bucket MORATORIO
        const splitMor = splitProporcional(
          restante,
          conceptos.desglose.moratorioPendiente,
          conceptos.desglose.ivaMoratorioPendiente,
        );
        const aplicadoMoratorio    = splitMor.aPrincipal;
        const aplicadoIVAMoratorio = splitMor.aIva;
        restante = round2(restante - splitMor.used);

        // 2. Bucket RENTA
        const splitRenta = splitProporcional(
          restante,
          conceptos.desglose.rentaPendiente,
          conceptos.desglose.ivaPendiente,
        );
        const aplicadoRenta    = splitRenta.aPrincipal;
        const aplicadoIVARenta = splitRenta.aIva;
        restante = round2(restante - splitRenta.used);

        const montoTotal = aplicadoMoratorio + aplicadoIVAMoratorio + aplicadoRenta + aplicadoIVARenta;

        if (montoTotal <= 0) {
          return { ok: false, status: 400, error: 'El monto no alcanza para cubrir ningún concepto' } as const;
        }

        // Calcular días de atraso al momento del pago
        const vencimiento = new Date(entry.fechaPago);
        const diasAtraso = vencimiento < now
          ? Math.floor((now.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Determinar tipo de pago
        const rentaTotalDespuesDePago = conceptos.desglose.rentaPendiente - aplicadoRenta;
        const esParcial = rentaTotalDespuesDePago > 0.01;

        const payment = await tx.payment.create({
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

        return {
          ok: true as const,
          payment,
          entry,
          prevPayments,
          tasaAnual,
          now,
          aplicado: {
            moratorio: aplicadoMoratorio,
            ivaMoratorio: aplicadoIVAMoratorio,
            renta: aplicadoRenta,
            ivaRenta: aplicadoIVARenta,
            total: montoTotal,
          },
          esParcial,
          restante,
        };
      },
      { route: '/api/cobranza/pay', reqId: req.id ? String(req.id) : undefined },
    );

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const { payment, entry, prevPayments, tasaAnual, now, aplicado, esParcial, restante } = result;

    // Recalcular conceptos POST-INSERT para devolver el estado actualizado.
    // Lo hacemos fuera de la TX (es solo lectura, no compite por concurrencia).
    const updatedPayments = [...prevPayments, payment];
    const updatedConceptos = calcConceptos(entry, tasaAnual, updatedPayments, now);

    // Notificaciones — fire-and-forget, fuera de la TX para que un email lento
    // no expanda el window de la TX y para no duplicarse en caso de retry.
    notificar({
      tipo: 'PAGO_REGISTRADO',
      titulo: `Pago periodo ${data.periodo} · ${entry.contract.folio}`,
      mensaje: `${nombreCliente(entry.contract.client)} pagó ${fmt$(aplicado.total)}${esParcial ? ' (parcial)' : ''}`,
      entidad: 'Payment',
      entidadId: payment.id,
      url: `/cobranza/contrato/${data.contractId}`,
      ejecutivoId: entry.contract.userId,
    });
    if (esParcial) {
      notificarPorRol(['COBRANZA'], {
        tipo: 'PAGO_PARCIAL',
        titulo: `Pago parcial ${entry.contract.folio} P${data.periodo}`,
        mensaje: `${nombreCliente(entry.contract.client)} dejó pendiente ${fmt$(updatedConceptos.desglose.totalAdeudado)}`,
        entidad: 'Payment',
        entidadId: payment.id,
        url: `/cobranza/contrato/${data.contractId}`,
      });
    }

    res.json({
      payment,
      aplicacion: {
        moratorio: aplicado.moratorio,
        ivaMoratorio: aplicado.ivaMoratorio,
        renta: aplicado.renta,
        ivaRenta: aplicado.ivaRenta,
        total: aplicado.total,
        sobrante: Math.round(restante * 100) / 100,
      },
      estadoPeriodo: updatedConceptos,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    log.error({ err: error }, 'Payment error');
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

/**
 * Resultado de la TX de pay-advance: o lista de pagos creados, o un error
 * de negocio reportable al cliente. Igual que en /pay, evita usar throws
 * como control de flujo.
 */
/** Subset del Contract que devolvemos desde la TX (con el select de abajo). */
type ContractForAdvance = {
  tasaAnual: any;
  folio: string;
  userId: string;
  client: { tipo: string; nombre: string | null; apellidoPaterno: string | null; razonSocial: string | null } | null;
};

type PayAdvanceTxResult =
  | {
      ok: true;
      contract: ContractForAdvance;
      results: Array<{ periodo: number; payment: Awaited<ReturnType<typeof prisma.payment.create>> }>;
    }
  | { ok: false; status: number; error: string };

router.post('/pay-advance', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = payAdvanceSchema.parse(req.body);

    // Sección crítica: lectura del estado actual de cada periodo + creación
    // de Payments en la MISMA transacción Serializable. Sin esto, dos
    // requests de pay-advance concurrentes para los mismos periodos del
    // mismo contrato podrían crear pagos duplicados (mismo bug que /pay,
    // multiplicado por N periodos).
    //
    // El advisory lock se toma sobre el contractId (sin periodo, segundo
    // arg = 0): pay-advance toca múltiples periodos del MISMO contrato y
    // queremos serializarlos como un solo bloque para que no choque
    // tampoco con un /pay simultáneo del mismo contrato.
    const result: PayAdvanceTxResult = await serializableTransaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.contractId})::int4, 0::int4)`;

        const entries = await tx.amortizationEntry.findMany({
          where: { contractId: data.contractId, periodo: { in: data.periodos } },
          orderBy: { periodo: 'asc' },
        });

        if (entries.length !== data.periodos.length) {
          return { ok: false, status: 400, error: 'Algunos periodos no existen' } as const;
        }

        // Pagos previos DENTRO de la TX (snapshot consistente bajo Serializable).
        const existingPayments = await tx.payment.findMany({
          where: { contractId: data.contractId, periodo: { in: data.periodos } },
        });

        const paymentsByPeriodo = new Map<number, typeof existingPayments>();
        existingPayments.forEach((p) => {
          if (p.periodo === null) return;
          if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
          paymentsByPeriodo.get(p.periodo)!.push(p);
        });

        const contract = await tx.contract.findUnique({
          where: { id: data.contractId },
          select: {
            tasaAnual: true,
            folio: true,
            userId: true,
            client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
          },
        });
        if (!contract) return { ok: false, status: 404, error: 'Contrato no encontrado' } as const;

        const now = new Date();
        const tasaAnual = Number(contract.tasaAnual);

        const results: Array<{ periodo: number; payment: Awaited<ReturnType<typeof tx.payment.create>> }> = [];
        for (const entry of entries) {
          const periodPayments = paymentsByPeriodo.get(entry.periodo) || [];
          const conceptos = calcConceptos(entry, tasaAnual, periodPayments, now);

          if (conceptos.estatus === 'PAGADO') continue;

          const montoRenta = conceptos.desglose.rentaPendiente;
          const montoIVA = conceptos.desglose.ivaPendiente;
          const montoMoratorio = conceptos.desglose.moratorioPendiente;
          const montoIVAMoratorio = conceptos.desglose.ivaMoratorioPendiente;
          const montoTotal = conceptos.desglose.totalAdeudado;

          const payment = await tx.payment.create({
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

        return { ok: true as const, contract, results };
      },
      { route: '/api/cobranza/pay-advance', reqId: req.id ? String(req.id) : undefined },
    );

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const { contract, results } = result;
    const totalPagado =
      Math.round(results.reduce((s, r) => s + Number(r.payment.montoTotal), 0) * 100) / 100;

    // Notificación FUERA de la TX para no duplicarse en retries.
    if (results.length > 0) {
      const periodos = results.map((r) => r.periodo).join(', ');
      notificar({
        tipo: 'PAGO_ADELANTADO',
        titulo: `Pago adelantado ${contract.folio} (${results.length} periodos)`,
        mensaje: `${nombreCliente(contract.client)} pagó ${fmt$(totalPagado)} por periodos ${periodos}`,
        entidad: 'Contract',
        entidadId: data.contractId,
        url: `/cobranza/contrato/${data.contractId}`,
        ejecutivoId: contract.userId,
      });
    }

    res.json({
      pagados: results.length,
      totalPagado,
      detalle: results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    log.error({ err: error }, 'Advance payment error');
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
    log.error({ err: error }, 'Estado cuenta error');
    res.status(500).json({ error: 'Error al generar estado de cuenta' });
  }
});

// ─── POST /api/cobranza/pay-extra ───────────────────────────
// Aplica un abono adicional a capital (pago extra) sobre el saldo del contrato.
// Reglas:
//  - PURO: reduce cada renta futura por (monto / periodos_restantes) — prorrateo lineal.
//  - FINANCIERO: recalcula PMT con saldo nuevo y plazo restante; baja la renta.
// En ambos casos:
//  - Crea un Payment con tipo=ABONO_CAPITAL, montoCapitalExtra=monto.
//  - Reemplaza las filas futuras de AmortizationEntry (no toca historial pagado).
const payExtraSchema = z.object({
  contractId: z.string().min(1),
  monto: z.number().positive(),
  fechaPago: z.string().optional(),
  referencia: z.string().optional(),
  observaciones: z.string().optional(),
});

type PayExtraTxResult =
  | {
      ok: true;
      payment: Awaited<ReturnType<typeof prisma.payment.create>>;
      contract: {
        folio: string;
        userId: string;
        producto: string;
        client: { tipo: string; nombre: string | null; apellidoPaterno: string | null; razonSocial: string | null } | null;
      };
      recalculo: {
        producto: string;
        primerPeriodoAfectado: number;
        periodosRestantes: number;
        saldoAnterior: number;
        saldoNuevo: number;
        rentaAnterior: number;
        rentaNueva: number;
        ahorroPorPeriodo: number;
      };
    }
  | { ok: false; status: number; error: string };

router.post('/pay-extra', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = payExtraSchema.parse(req.body);

    // Sección crítica: lectura del contrato + amortización + pagos +
    // cálculo de nueva renta + escritura (delete+createMany+payment.create+
    // contract.update) DEBEN correr en la misma transacción Serializable.
    //
    // Bug ANTES (cobranza-guardian audit, abril 2026):
    //   El handler leía contract.amortizacion + contract.pagos FUERA de la
    //   TX, calculaba `nuevasFilas`, y SOLO entonces abría la TX para
    //   escribir. Dos pay-extra concurrentes sobre el mismo contrato
    //   leían el MISMO saldoActual, calculaban filas distintas (cada uno
    //   contando solo SU abono), y al hacer deleteMany+createMany se
    //   pisaban: la 2da TX borraba lo que la 1ra acabó de escribir. La
    //   tabla de amortización quedaba con sólo el efecto de uno de los
    //   abonos, el otro se perdía silenciosamente — pero el Payment SÍ
    //   se registraba para ambos, dejando contabilidad inconsistente.
    //
    // Fix:
    //   • serializableTransaction (mismo helper que /pay y /pay-advance).
    //   • Advisory lock contractId-only (segundo arg = 0): coordina pay/
    //     pay-advance/pay-extra entre sí sobre el mismo contrato.
    //   • TODAS las lecturas (contract, amortizacion, pagos) dentro de la TX.
    //   • Notificación notificar('ABONO_CAPITAL') FUERA (no se duplica en retry).
    const result: PayExtraTxResult = await serializableTransaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.contractId})::int4, 0::int4)`;

        const contract = await tx.contract.findUnique({
          where: { id: data.contractId },
          include: {
            amortizacion: { orderBy: { periodo: 'asc' } },
            pagos: { orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }] },
            client: { select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
          },
        });
        if (!contract) return { ok: false, status: 404, error: 'Contrato no encontrado' } as const;
        if (contract.amortizacion.length === 0) {
          return { ok: false, status: 400, error: 'El contrato no tiene tabla de amortización' } as const;
        }

        const now = new Date();
        const tasaAnualNum = Number(contract.tasaAnual);
        const tasaMensual = tasaAnualNum / 12;

        const paymentsByPeriodo = new Map<number, typeof contract.pagos>();
        contract.pagos.forEach((p) => {
          if (p.periodo === null) return;
          if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
          paymentsByPeriodo.get(p.periodo)!.push(p);
        });

        let primerPeriodoAbono: number | null = null;
        for (const entry of contract.amortizacion) {
          const periodPayments = paymentsByPeriodo.get(entry.periodo) || [];
          const conceptos = calcConceptos(entry, tasaAnualNum, periodPayments, now);
          if (conceptos.estatus !== 'PAGADO') {
            primerPeriodoAbono = entry.periodo;
            break;
          }
        }
        if (primerPeriodoAbono === null) {
          return {
            ok: false,
            status: 400,
            error: 'Todos los periodos están pagados; no hay saldo al cual aplicar el abono',
          } as const;
        }

        const periodosFuturos = contract.amortizacion.filter((e) => e.periodo >= primerPeriodoAbono!);
        const primerEntry = periodosFuturos[0];
        const saldoActual = Number(primerEntry.saldoInicial);

        if (data.monto >= saldoActual + 0.01) {
          return {
            ok: false,
            status: 400,
            error: `El abono ($${data.monto.toFixed(2)}) excede el saldo insoluto ($${saldoActual.toFixed(2)}). Si quieres liquidar, usa la opción de Liquidación Anticipada.`,
          } as const;
        }

        const isPuro = contract.producto === 'PURO';
        const periodosRestantes = periodosFuturos.length;
        const saldoNuevo = round2(saldoActual - data.monto);

        let nuevaRenta: number;
        if (isPuro) {
          const rentaActual = Number(primerEntry.renta);
          nuevaRenta = round2(rentaActual - data.monto / periodosRestantes);
          if (nuevaRenta < 0) {
            return { ok: false, status: 400, error: 'El abono prorrateado deja la renta en negativo. Reduce el monto.' } as const;
          }
        } else {
          if (tasaMensual === 0) {
            nuevaRenta = round2(saldoNuevo / periodosRestantes);
          } else {
            const factor = Math.pow(1 + tasaMensual, periodosRestantes);
            nuevaRenta = round2((saldoNuevo * tasaMensual * factor) / (factor - 1));
          }
        }

        const seguroOriginal = Number(primerEntry.seguro || 0);
        const nuevasFilas: Array<{
          periodo: number;
          fechaPago: Date;
          saldoInicial: number;
          intereses: number;
          pagoCapital: number;
          renta: number;
          iva: number;
          seguro: number;
          pagoTotal: number;
          saldoFinal: number;
        }> = [];
        let saldo = saldoNuevo;
        for (let i = 0; i < periodosFuturos.length; i++) {
          const orig = periodosFuturos[i];
          const intereses = round2(saldo * tasaMensual);
          const pagoCapital = isPuro ? 0 : round2(nuevaRenta - intereses);
          const ivaRow = round2(nuevaRenta * IVA);
          const saldoFinalRow = isPuro ? saldo : Math.max(0, round2(saldo - pagoCapital));
          nuevasFilas.push({
            periodo: orig.periodo,
            fechaPago: orig.fechaPago,
            saldoInicial: round2(saldo),
            intereses,
            pagoCapital,
            renta: nuevaRenta,
            iva: ivaRow,
            seguro: round2(seguroOriginal),
            pagoTotal: round2(nuevaRenta + ivaRow + seguroOriginal),
            saldoFinal: saldoFinalRow,
          });
          saldo = saldoFinalRow;
        }

        // Escrituras (todas dentro de la misma TX serializable):
        await tx.amortizationEntry.deleteMany({
          where: { contractId: data.contractId, periodo: { gte: primerPeriodoAbono! } },
        });
        await tx.amortizationEntry.createMany({
          data: nuevasFilas.map((f) => ({ ...f, contractId: data.contractId })),
        });

        const payment = await tx.payment.create({
          data: {
            contractId: data.contractId,
            userId,
            periodo: primerPeriodoAbono,
            tipo: 'ABONO_CAPITAL',
            fechaPago: data.fechaPago ? new Date(data.fechaPago) : now,
            fechaVencimiento: primerEntry.fechaPago,
            montoRenta: 0,
            montoIVA: 0,
            montoMoratorio: 0,
            montoIVAMoratorio: 0,
            montoCapitalExtra: round2(data.monto),
            montoTotal: round2(data.monto),
            diasAtraso: 0,
            referencia: data.referencia || null,
            observaciones:
              data.observaciones ||
              `Abono a capital · ${isPuro ? 'PURO prorrateado' : 'FINANCIERO PMT recalculado'}`,
          },
        });

        await tx.contract.update({
          where: { id: data.contractId },
          data: {
            rentaMensual: nuevaRenta,
            rentaMensualIVA: round2(nuevaRenta * (1 + IVA)),
          },
        });

        return {
          ok: true as const,
          payment,
          contract: {
            folio: contract.folio,
            userId: contract.userId,
            producto: contract.producto,
            client: contract.client,
          },
          recalculo: {
            producto: contract.producto,
            primerPeriodoAfectado: primerPeriodoAbono,
            periodosRestantes,
            saldoAnterior: round2(saldoActual),
            saldoNuevo,
            rentaAnterior: Number(primerEntry.renta),
            rentaNueva: nuevaRenta,
            ahorroPorPeriodo: round2(Number(primerEntry.renta) - nuevaRenta),
          },
        };
      },
      { route: '/api/cobranza/pay-extra', reqId: req.id ? String(req.id) : undefined },
    );

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const { payment, contract, recalculo } = result;

    notificar({
      tipo: 'ABONO_CAPITAL',
      titulo: `Abono a capital ${contract.folio} (${fmt$(data.monto)})`,
      mensaje: `${nombreCliente(contract.client)} — nueva renta ${fmt$(recalculo.rentaNueva)} (ahorro ${fmt$(recalculo.ahorroPorPeriodo)}/periodo)`,
      entidad: 'Contract',
      entidadId: data.contractId,
      url: `/cobranza/contrato/${data.contractId}`,
      ejecutivoId: contract.userId,
    });

    res.json({
      payment,
      recalculo,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    log.error({ err: error }, 'Pay extra error');
    res.status(500).json({ error: 'Error al aplicar abono extra' });
  }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── GET /api/cobranza/payment/:id/recibo ────────────────────
// Devuelve los datos necesarios para generar el PDF del recibo de pago.
// El folio del recibo se calcula al vuelo: REC-YYYY-NNNN donde NNNN es
// el orden secuencial del pago dentro del año (basado en createdAt).
router.get('/payment/:id/recibo', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            client: {
              select: {
                id: true, tipo: true, nombre: true, apellidoPaterno: true,
                apellidoMaterno: true, razonSocial: true, rfc: true,
                telefono: true, email: true,
              },
            },
          },
        },
        user: { select: { nombre: true, apellidos: true, email: true } },
      },
    });

    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    // Folio consecutivo por año
    const yearStart = new Date(payment.createdAt.getFullYear(), 0, 1);
    const yearEnd = new Date(payment.createdAt.getFullYear() + 1, 0, 1);
    const seq = await prisma.payment.count({
      where: {
        createdAt: { gte: yearStart, lt: yearEnd, lte: payment.createdAt },
      },
    });
    const folio = `REC-${payment.createdAt.getFullYear()}-${String(seq).padStart(4, '0')}`;

    res.json({
      folio,
      pago: {
        id: payment.id,
        tipo: payment.tipo,
        periodo: payment.periodo,
        fechaPago: payment.fechaPago,
        fechaVencimiento: payment.fechaVencimiento,
        montoRenta: Number(payment.montoRenta),
        montoIVA: Number(payment.montoIVA),
        montoSeguro: Number(payment.montoSeguro),
        montoMoratorio: Number(payment.montoMoratorio),
        montoIVAMoratorio: Number(payment.montoIVAMoratorio),
        montoCapitalExtra: Number(payment.montoCapitalExtra),
        montoTotal: Number(payment.montoTotal),
        diasAtraso: payment.diasAtraso,
        referencia: payment.referencia,
        observaciones: payment.observaciones,
        createdAt: payment.createdAt,
      },
      contrato: {
        id: payment.contract.id,
        folio: payment.contract.folio,
        producto: payment.contract.producto,
        plazo: payment.contract.plazo,
        client: payment.contract.client,
      },
      usuario: payment.user
        ? `${payment.user.nombre || ''} ${payment.user.apellidos || ''}`.trim() || payment.user.email
        : null,
    });
  } catch (error) {
    log.error({ err: error }, 'Recibo error');
    res.status(500).json({ error: 'Error al obtener recibo' });
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
router.post('/seed-amortization', requireAuth, async (_req: Request, res: Response) => {
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
    log.error({ err: error }, 'Seed amortization error');
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
    log.error({ err: error }, 'Delete payment error');
    res.status(500).json({ error: 'Error al cancelar pago' });
  }
});

export default router;
