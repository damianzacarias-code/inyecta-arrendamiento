/**
 * Centro de Alertas Unificado
 *
 *   GET /api/alerts
 *
 * Agrega alertas de tres fuentes:
 *  1. Cobranza vencida   — entries de amortización con diasAtraso > 0
 *  2. Pólizas de seguro  — vencidas / por vencer / contratos sin póliza
 *  3. Documentos         — ExpedienteDocumento con estatus RECHAZADO
 *                         (el modelo nuevo no tiene fechaVencimiento;
 *                         la "alerta" relevante es revisión rechazada)
 *
 * Cada alerta tiene la misma forma:
 *   { kind, level: CRITICA|ALTA|MEDIA|BAJA, mensaje, actionUrl, ... }
 *
 * Devuelve agrupado por kind y ordenado por severidad.
 */
import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { childLogger } from '../lib/logger';

const log = childLogger('alerts');

const router = Router();

type AlertLevel = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';

interface UnifiedAlert {
  kind: 'COBRANZA_VENCIDA' | 'POLIZA_VENCIMIENTO' | 'SIN_POLIZA' | 'DOCUMENTO_VENCIDO';
  level: AlertLevel;
  contractId?: string;
  contractFolio?: string;
  clienteId?: string;
  cliente: string;
  mensaje: string;
  actionUrl: string;
  monto?: number;
  diasAtraso?: number;
  diasRestantes?: number;
  meta?: Record<string, any>;
}

// Helper: nombre del cliente según tipo
function clientName(c: { tipo: string; nombre?: string | null; apellidoPaterno?: string | null; razonSocial?: string | null }): string {
  if (c.tipo === 'PM') return c.razonSocial || '(sin razón social)';
  return `${c.nombre || ''} ${c.apellidoPaterno || ''}`.trim() || '(sin nombre)';
}

router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const alerts: UnifiedAlert[] = [];

    // ─── 1. Cobranza vencida ─────────────────────────────────
    // Buscamos entries con fechaPago < hoy en contratos vigentes
    const overdueEntries = await prisma.amortizationEntry.findMany({
      where: {
        fechaPago: { lt: now },
        contract: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      },
      include: {
        contract: {
          select: {
            id: true, folio: true, tasaAnual: true,
            client: {
              select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true },
            },
          },
        },
      },
      orderBy: { fechaPago: 'asc' },
    });

    // Buscar pagos para esos periodos
    const contractIds = [...new Set(overdueEntries.map(e => e.contractId))];
    const payments = await prisma.payment.findMany({
      where: { contractId: { in: contractIds } },
    });
    const paidByKey = new Map<string, number>();
    payments.forEach(p => {
      const key = `${p.contractId}-${p.periodo}`;
      paidByKey.set(key, (paidByKey.get(key) || 0) + Number(p.montoTotal));
    });

    for (const e of overdueEntries) {
      const key = `${e.contractId}-${e.periodo}`;
      const pagado = paidByKey.get(key) || 0;
      const totalEsperado = Number(e.pagoTotal);
      if (pagado >= totalEsperado - 0.01) continue; // ya pagado completo

      const pendiente = totalEsperado - pagado;
      const diasAtraso = Math.floor((now.getTime() - new Date(e.fechaPago).getTime()) / (1000 * 60 * 60 * 24));

      let level: AlertLevel = 'MEDIA';
      if (diasAtraso > 30) level = 'CRITICA';
      else if (diasAtraso > 15) level = 'ALTA';
      else if (diasAtraso > 7) level = 'MEDIA';
      else level = 'BAJA';

      alerts.push({
        kind: 'COBRANZA_VENCIDA',
        level,
        contractId: e.contract.id,
        contractFolio: e.contract.folio,
        clienteId: e.contract.client.id,
        cliente: clientName(e.contract.client),
        mensaje: `Renta ${e.periodo} vencida hace ${diasAtraso} día(s) — $${pendiente.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`,
        actionUrl: `/cobranza?contractId=${e.contract.id}`,
        monto: Math.round(pendiente * 100) / 100,
        diasAtraso,
        meta: { periodo: e.periodo },
      });
    }

    // ─── 2. Pólizas de seguro ────────────────────────────────
    const policies = await prisma.insurancePolicy.findMany({
      where: { vigente: true },
      include: {
        contract: {
          select: {
            id: true, folio: true,
            client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
          },
        },
      },
    });

    for (const p of policies) {
      if (!p.fechaVencimiento) continue;
      const days = Math.floor((new Date(p.fechaVencimiento).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 30) continue;

      let level: AlertLevel = 'BAJA';
      if (days < 0) level = 'CRITICA';
      else if (days <= 7) level = 'ALTA';
      else if (days <= 15) level = 'MEDIA';

      alerts.push({
        kind: 'POLIZA_VENCIMIENTO',
        level,
        contractId: p.contract.id,
        contractFolio: p.contract.folio,
        clienteId: p.contract.client.id,
        cliente: clientName(p.contract.client),
        mensaje: days < 0
          ? `Póliza ${p.numPoliza || ''} vencida hace ${Math.abs(days)} día(s)`
          : `Póliza ${p.numPoliza || ''} vence en ${days} día(s)`,
        actionUrl: `/seguros?renew=${p.id}`,
        diasRestantes: days,
        meta: { aseguradora: p.aseguradora, numPoliza: p.numPoliza },
      });
    }

    // Contratos vigentes sin póliza
    const sinPoliza = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      select: {
        id: true, folio: true,
        seguros: { where: { vigente: true }, select: { id: true } },
        client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
      },
    });
    sinPoliza
      .filter(c => c.seguros.length === 0)
      .forEach(c => {
        alerts.push({
          kind: 'SIN_POLIZA',
          level: 'ALTA',
          contractId: c.id,
          contractFolio: c.folio,
          clienteId: c.client.id,
          cliente: clientName(c.client),
          mensaje: 'Contrato vigente SIN póliza de seguro',
          actionUrl: `/seguros?create=${c.id}`,
        });
      });

    // ─── 3. Documentos rechazados ────────────────────────────
    // El nuevo modelo (ExpedienteDocumento) no tiene fechaVencimiento.
    // La alerta operativa relevante es: documentos que el revisor marcó
    // como RECHAZADOS y que aún no se reemplazan. Cada uno bloquea la
    // formalización del contrato correspondiente.
    const docsRechazados = await prisma.expedienteDocumento.findMany({
      where: { estatus: 'RECHAZADO' },
      include: {
        actor: {
          include: {
            contract: {
              select: {
                id: true, folio: true,
                client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
              },
            },
          },
        },
      },
    });

    for (const d of docsRechazados) {
      const contract = d.actor.contract;
      const actorLabel = d.actor.nombre || d.actor.tipo;
      alerts.push({
        kind: 'DOCUMENTO_VENCIDO',
        level: 'ALTA',
        contractId: contract.id,
        contractFolio: contract.folio,
        clienteId: contract.client.id,
        cliente: clientName(contract.client),
        mensaje: `Documento "${d.nombreArchivo}" RECHAZADO en expediente (${actorLabel})`,
        actionUrl: `/contratos/${contract.id}?tab=expediente`,
        meta: {
          tipoDocumento: d.tipoDocumento,
          documentoId: d.id,
          actorId: d.actor.id,
          actorTipo: d.actor.tipo,
        },
      });
    }

    // ─── Ordenar por severidad ───────────────────────────────
    const order: Record<AlertLevel, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);

    res.json({
      total: alerts.length,
      summary: {
        criticas: alerts.filter(a => a.level === 'CRITICA').length,
        altas: alerts.filter(a => a.level === 'ALTA').length,
        medias: alerts.filter(a => a.level === 'MEDIA').length,
        bajas: alerts.filter(a => a.level === 'BAJA').length,
      },
      byKind: {
        cobranza: alerts.filter(a => a.kind === 'COBRANZA_VENCIDA').length,
        seguros:  alerts.filter(a => a.kind === 'POLIZA_VENCIMIENTO' || a.kind === 'SIN_POLIZA').length,
        documentos: alerts.filter(a => a.kind === 'DOCUMENTO_VENCIDO').length,
      },
      alerts,
    });
  } catch (error: any) {
    log.error({ err: error }, 'Alerts error');
    res.status(500).json({ error: error.message || 'Error al obtener alertas' });
  }
});

export default router;
