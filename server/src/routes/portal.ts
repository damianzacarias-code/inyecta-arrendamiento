/**
 * Portal del Arrendatario
 *
 * Endpoints públicos (sin Bearer JWT) que el cliente final usa para consultar
 * su información autenticándose con un token único impreso en su contrato.
 *
 *   GET   /api/portal/:token                     — Info del cliente + sus contratos
 *   GET   /api/portal/:token/contract/:id        — Estado de cuenta del contrato
 *   GET   /api/portal/:token/payments            — Historial de pagos (con folio recibo)
 *   GET   /api/portal/:token/invoices            — Facturas del cliente
 *   POST  /api/portal/regenerate-token/:clientId — (Solo staff) regenera el token
 *
 * El token se imprime en el contrato y se entrega al cliente al firmar.
 * El portal del cliente vive en el frontend en /portal/:token (sin login).
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Helper: cargar cliente por token ───
async function loadClientByToken(token: string) {
  const client = await prisma.client.findUnique({ where: { portalToken: token } });
  if (!client) return null;
  // Marcar último acceso (best-effort, no bloquea respuesta)
  prisma.client.update({
    where: { id: client.id },
    data: { portalUltimoAcceso: new Date() },
  }).catch(() => {});
  return client;
}

function nombreCliente(c: any): string {
  if (c.tipo === 'PM') return c.razonSocial || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ').trim();
}

// ─── GET /api/portal/:token ─────────────────────────────────
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const client = await loadClientByToken(req.params.token);
    if (!client) return res.status(404).json({ error: 'Token inválido' });

    const contratos = await prisma.contract.findMany({
      where: { clientId: client.id },
      select: {
        id: true,
        folio: true,
        producto: true,
        plazo: true,
        rentaMensual: true,
        rentaMensualIVA: true,
        montoFinanciar: true,
        fechaInicio: true,
        fechaVencimiento: true,
        estatus: true,
        etapa: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      cliente: {
        id: client.id,
        tipo: client.tipo,
        nombre: nombreCliente(client),
        rfc: client.rfc,
        email: client.email,
      },
      contratos: contratos.map(c => ({
        ...c,
        rentaMensual: Number(c.rentaMensual),
        rentaMensualIVA: Number(c.rentaMensualIVA),
        montoFinanciar: Number(c.montoFinanciar),
      })),
    });
  } catch (error) {
    console.error('Portal load error:', error);
    res.status(500).json({ error: 'Error al cargar información' });
  }
});

// ─── GET /api/portal/:token/contract/:id ────────────────────
router.get('/:token/contract/:id', async (req: Request, res: Response) => {
  try {
    const client = await loadClientByToken(req.params.token);
    if (!client) return res.status(404).json({ error: 'Token inválido' });

    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, clientId: client.id },
      include: {
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: { orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const now = new Date();
    const tasaAnual = Number(contract.tasaAnual);
    const IVA = 0.16;

    const paymentsByPeriodo = new Map<number, typeof contract.pagos>();
    contract.pagos.forEach(p => {
      if (p.periodo === null) return;
      if (!paymentsByPeriodo.has(p.periodo)) paymentsByPeriodo.set(p.periodo, []);
      paymentsByPeriodo.get(p.periodo)!.push(p);
    });

    // Resumen ligero por periodo
    const periodos = contract.amortizacion.map(entry => {
      const pagos = paymentsByPeriodo.get(entry.periodo) || [];
      const renta = Number(entry.renta);
      const ivaRow = Number(entry.iva);
      const pagadoRenta = pagos.reduce((s, p) => s + Number(p.montoRenta), 0);
      const pagadoIVA = pagos.reduce((s, p) => s + Number(p.montoIVA), 0);
      const rentaPendiente = Math.max(0, Math.round((renta - pagadoRenta) * 100) / 100);
      const ivaPendiente = Math.max(0, Math.round((ivaRow - pagadoIVA) * 100) / 100);
      const cubierta = rentaPendiente <= 0.01 && ivaPendiente <= 0.01;
      const venc = new Date(entry.fechaPago);
      const isOverdue = !cubierta && venc < now;
      const diasAtraso = isOverdue
        ? Math.floor((now.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const moratorio = isOverdue
        ? Math.round((rentaPendiente + ivaPendiente) * (tasaAnual * 2 / 360) * diasAtraso * 100) / 100
        : 0;
      const ivaMoratorio = Math.round(moratorio * IVA * 100) / 100;

      let estatus: string;
      if (cubierta) estatus = 'PAGADO';
      else if (pagos.length > 0) estatus = 'PARCIAL';
      else if (isOverdue) estatus = 'VENCIDO';
      else if (venc <= now) estatus = 'PENDIENTE';
      else estatus = 'FUTURO';

      return {
        periodo: entry.periodo,
        fechaPago: entry.fechaPago,
        renta,
        ivaRenta: ivaRow,
        rentaPendiente,
        ivaPendiente,
        moratorio,
        ivaMoratorio,
        totalAdeudado: Math.round((rentaPendiente + ivaPendiente + moratorio + ivaMoratorio) * 100) / 100,
        diasAtraso,
        estatus,
        pagos: pagos.length,
      };
    });

    const totalAdeudado = periodos.reduce((s, p) => s + p.totalAdeudado, 0);
    const proximoPago = periodos.find(p => p.estatus === 'PENDIENTE' || p.estatus === 'VENCIDO');

    res.json({
      contrato: {
        id: contract.id,
        folio: contract.folio,
        producto: contract.producto,
        plazo: contract.plazo,
        tasaAnual,
        rentaMensual: Number(contract.rentaMensual),
        rentaMensualIVA: Number(contract.rentaMensualIVA),
        fechaInicio: contract.fechaInicio,
        fechaVencimiento: contract.fechaVencimiento,
        estatus: contract.estatus,
      },
      resumen: {
        totalAdeudado: Math.round(totalAdeudado * 100) / 100,
        periodosVencidos: periodos.filter(p => p.estatus === 'VENCIDO').length,
        proximoPago: proximoPago
          ? { periodo: proximoPago.periodo, fecha: proximoPago.fechaPago, monto: proximoPago.totalAdeudado }
          : null,
      },
      periodos,
    });
  } catch (error) {
    console.error('Portal contract error:', error);
    res.status(500).json({ error: 'Error al obtener contrato' });
  }
});

// ─── GET /api/portal/:token/payments ────────────────────────
router.get('/:token/payments', async (req: Request, res: Response) => {
  try {
    const client = await loadClientByToken(req.params.token);
    if (!client) return res.status(404).json({ error: 'Token inválido' });

    const payments = await prisma.payment.findMany({
      where: { contract: { clientId: client.id } },
      include: { contract: { select: { folio: true } } },
      orderBy: { fechaPago: 'desc' },
      take: 200,
    });

    res.json({
      payments: payments.map(p => ({
        id: p.id,
        contractFolio: p.contract.folio,
        periodo: p.periodo,
        fechaPago: p.fechaPago,
        tipo: p.tipo,
        montoTotal: Number(p.montoTotal),
        montoRenta: Number(p.montoRenta),
        montoIVA: Number(p.montoIVA),
        montoMoratorio: Number(p.montoMoratorio),
        referencia: p.referencia,
        diasAtraso: p.diasAtraso,
      })),
    });
  } catch (error) {
    console.error('Portal payments error:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// ─── GET /api/portal/:token/invoices ────────────────────────
router.get('/:token/invoices', async (req: Request, res: Response) => {
  try {
    const client = await loadClientByToken(req.params.token);
    if (!client) return res.status(404).json({ error: 'Token inválido' });

    const invoices = await prisma.invoice.findMany({
      where: { clientId: client.id },
      include: { contract: { select: { folio: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      invoices: invoices.map(inv => ({
        id: inv.id,
        serie: inv.serie,
        folio: inv.folio,
        uuid: inv.uuid,
        fechaTimbrado: inv.fechaTimbrado,
        status: inv.status,
        subtotal: Number(inv.subtotal),
        iva: Number(inv.iva),
        total: Number(inv.total),
        contractFolio: inv.contract.folio,
        xmlUrl: inv.xmlUrl,
        pdfUrl: inv.pdfUrl,
      })),
    });
  } catch (error) {
    console.error('Portal invoices error:', error);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

// ─── POST /api/portal/regenerate-token/:clientId ────────────
// Solo staff: genera (o regenera) el token del portal para un cliente.
router.post('/regenerate-token/:clientId', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    const client = await prisma.client.update({
      where: { id: req.params.clientId },
      data: { portalToken: token },
      select: { id: true, portalToken: true },
    });
    res.json({
      ok: true,
      clientId: client.id,
      portalToken: client.portalToken,
      portalUrl: `/portal/${client.portalToken}`,
    });
  } catch (error: any) {
    console.error('Portal regenerate error:', error);
    res.status(500).json({ error: error.message || 'Error al generar token' });
  }
});

export default router;
