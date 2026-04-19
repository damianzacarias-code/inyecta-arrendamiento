/**
 * Rutas de Facturación CFDI 4.0
 *
 *  POST  /api/invoices/facturar         — Timbra una factura (de un pago o conceptos manuales)
 *  POST  /api/invoices/:id/cancelar     — Cancela un CFDI ante el SAT (vía provider)
 *  GET   /api/invoices                  — Lista facturas (filtra por contractId, clientId, status)
 *  GET   /api/invoices/:id              — Detalle de una factura (incluye XML decodificado)
 *  GET   /api/invoices/:id/xml          — Descarga del XML
 *
 * El provider real (Facturama / SW) se enchufa vía CFDI_PROVIDER en .env.
 * Por defecto se usa MOCK para desarrollo sin credenciales del SAT.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { getCfdiProvider, CfdiInvoiceInput } from '../services/cfdiProvider';

const router = Router();
const IVA = 0.16;

// Asegura el directorio /uploads/facturas/
const FACTURAS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'facturas');
if (!fs.existsSync(FACTURAS_DIR)) fs.mkdirSync(FACTURAS_DIR, { recursive: true });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Construye nombre completo del receptor según tipo de cliente */
function nombreReceptor(client: {
  tipo: string;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
}): string {
  if (client.tipo === 'PM') {
    return client.razonSocial || '';
  }
  return [client.nombre, client.apellidoPaterno, client.apellidoMaterno]
    .filter(Boolean).join(' ').trim();
}

// ─── POST /api/invoices/facturar ─────────────────────────────
const facturarSchema = z.object({
  paymentId: z.string().optional(),
  contractId: z.string().optional(),
  // Conceptos opcionales (si se factura sin pago, p.ej. una nota de cargo)
  conceptos: z.array(z.object({
    descripcion: z.string().min(1),
    cantidad: z.number().positive(),
    valorUnitario: z.number().positive(),
    claveProdServ: z.string().optional(),
    claveUnidad: z.string().optional(),
  })).optional(),
  serie: z.string().default('A'),
  usoCfdi: z.string().default('G03'),
  metodoPago: z.string().default('PUE'),
  formaPago: z.string().default('03'),
  tipo: z.enum(['INGRESO', 'EGRESO', 'PAGO']).default('INGRESO'),
});

router.post('/facturar', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = facturarSchema.parse(req.body);

    if (!data.paymentId && (!data.contractId || !data.conceptos || data.conceptos.length === 0)) {
      return res.status(400).json({ error: 'Se requiere paymentId o (contractId + conceptos)' });
    }

    // ─── Cargar contexto: pago/contrato/cliente ───
    const paymentWithCtx = data.paymentId
      ? await prisma.payment.findUnique({
          where: { id: data.paymentId },
          include: { contract: { include: { client: true } } },
        })
      : null;

    let contractId: string;
    let clientId: string;

    if (data.paymentId) {
      if (!paymentWithCtx) return res.status(404).json({ error: 'Pago no encontrado' });
      contractId = paymentWithCtx.contractId;
      clientId = paymentWithCtx.contract.clientId;

      // Si ya tiene factura, evitar doble timbrado
      const existente = await prisma.invoice.findUnique({ where: { paymentId: data.paymentId } });
      if (existente && existente.status === 'TIMBRADO') {
        return res.status(409).json({
          error: 'Este pago ya fue facturado',
          factura: { id: existente.id, uuid: existente.uuid, folio: existente.folio },
        });
      }
    } else {
      const contractStandalone = await prisma.contract.findUnique({
        where: { id: data.contractId! },
        include: { client: true },
      });
      if (!contractStandalone) return res.status(404).json({ error: 'Contrato no encontrado' });
      contractId = contractStandalone.id;
      clientId = contractStandalone.clientId;
    }

    // Obtener cliente y contrato (siempre que no se hayan cargado vía paymentWithCtx)
    const cliente = paymentWithCtx
      ? paymentWithCtx.contract.client
      : await prisma.client.findUnique({ where: { id: clientId } });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!cliente.rfc) return res.status(400).json({ error: 'El cliente no tiene RFC registrado' });

    const contract = paymentWithCtx
      ? paymentWithCtx.contract
      : await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    // ─── Construir conceptos ───
    let conceptos: CfdiInvoiceInput['conceptos'] = [];
    let subtotal = 0;
    let iva = 0;

    if (paymentWithCtx) {
      // Conceptos derivados del pago
      const renta = Number(paymentWithCtx.montoRenta);
      const ivaRenta = Number(paymentWithCtx.montoIVA);
      const moratorio = Number(paymentWithCtx.montoMoratorio);
      const ivaMoratorio = Number(paymentWithCtx.montoIVAMoratorio);

      if (renta > 0) {
        conceptos.push({
          descripcion: `Renta arrendamiento contrato ${contract.folio}${paymentWithCtx.periodo ? ` periodo ${paymentWithCtx.periodo}` : ''}`,
          cantidad: 1,
          valorUnitario: renta,
          importe: renta,
          claveProdServ: '80131502', // Servicios de arrendamiento
          claveUnidad: 'E48',         // Unidad de servicio
        });
        subtotal += renta;
        iva += ivaRenta;
      }
      if (moratorio > 0) {
        conceptos.push({
          descripcion: `Intereses moratorios contrato ${contract.folio}`,
          cantidad: 1,
          valorUnitario: moratorio,
          importe: moratorio,
          claveProdServ: '84121806', // Servicios financieros
          claveUnidad: 'E48',
        });
        subtotal += moratorio;
        iva += ivaMoratorio;
      }
    } else if (data.conceptos) {
      // Conceptos manuales
      for (const c of data.conceptos) {
        const importe = round2(c.cantidad * c.valorUnitario);
        conceptos.push({
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          valorUnitario: c.valorUnitario,
          importe,
          claveProdServ: c.claveProdServ || '80131502',
          claveUnidad: c.claveUnidad || 'E48',
        });
        subtotal += importe;
      }
      iva = round2(subtotal * IVA);
    }

    if (conceptos.length === 0) {
      return res.status(400).json({ error: 'No hay conceptos a facturar (montos en cero)' });
    }

    subtotal = round2(subtotal);
    iva = round2(iva);
    const total = round2(subtotal + iva);

    // ─── Folio consecutivo por serie ───
    const last = await prisma.invoice.findFirst({
      where: { serie: data.serie },
      orderBy: { folio: 'desc' },
      select: { folio: true },
    });
    const nextFolio = (last?.folio || 0) + 1;

    // ─── Llamar al provider de timbrado ───
    const provider = getCfdiProvider();
    const cfdiInput: CfdiInvoiceInput = {
      serie: data.serie,
      folio: nextFolio,
      tipo: data.tipo,
      receptor: {
        rfc: cliente.rfc,
        nombre: nombreReceptor(cliente),
        usoCfdi: data.usoCfdi,
        regimenFiscal: cliente.tipo === 'PM' ? '601' : '612',
      },
      conceptos,
      subtotal,
      iva,
      retenciones: 0,
      total,
      metodoPago: data.metodoPago,
      formaPago: data.formaPago,
    };

    // ─── Complemento de Pago (CFDI 2.0) ────────────────────────
    // Cuando se factura con tipo='PAGO' a partir de un Payment registrado,
    // construimos automáticamente el complemento Pagos20 referenciando el
    // CFDI de ingreso PPD original. SAT exige 1 línea de DoctoRelacionado
    // por cada factura ingreso que se está liquidando.
    if (data.tipo === 'PAGO' && paymentWithCtx) {
      // Buscar las facturas de ingreso PPD del mismo contrato/periodo aún con saldo
      const facturasIngreso = await prisma.invoice.findMany({
        where: {
          contractId,
          tipo: 'INGRESO',
          status: 'TIMBRADO',
          uuid: { not: null },
          metodoPago: 'PPD',
        },
        orderBy: { fechaTimbrado: 'asc' },
      });

      if (facturasIngreso.length > 0) {
        // Heurística simple: aplicar el pago a la primera ingreso pendiente.
        // Para casos avanzados (pago multi-factura) el cliente puede mandar
        // los DoctoRelacionado en req.body.documentosRelacionados (TODO).
        const f = facturasIngreso[0];
        const importePagado = Number(paymentWithCtx.montoTotal);
        const saldoAnterior = Number(f.total);
        const saldoInsoluto = Math.max(0, +(saldoAnterior - importePagado).toFixed(2));
        cfdiInput.complementoPago = {
          fechaPago: paymentWithCtx.fechaPago,
          formaPago: data.formaPago,
          monto:     importePagado,
          moneda:    'MXN',
          documentosRelacionados: [{
            uuidFactura:     f.uuid!,
            serie:           f.serie,
            folio:           String(f.folio),
            moneda:          'MXN',
            numParcialidad:  1,
            saldoAnterior,
            importePagado,
            saldoInsoluto,
          }],
        };
        // En complementos de Pago, los conceptos llevan importe 0 y el monto
        // real va dentro del complemento. Ajustamos:
        cfdiInput.subtotal = 0;
        cfdiInput.iva      = 0;
        cfdiInput.total    = 0;
        cfdiInput.conceptos = [{
          descripcion:   'Pago',
          cantidad:      1,
          valorUnitario: 0,
          importe:       0,
          claveProdServ: '84111506',  // Servicios de cobro de pagos
          claveUnidad:   'ACT',        // Actividad
        }];
      }
    }

    const timbrado = await provider.timbrar(cfdiInput);

    // ─── Guardar XML en disco ───
    const xmlFilename = `${data.serie}-${nextFolio}_${timbrado.uuid}.xml`;
    const xmlPath = path.join(FACTURAS_DIR, xmlFilename);
    fs.writeFileSync(xmlPath, Buffer.from(timbrado.xmlBase64, 'base64'));
    const xmlUrl = `/uploads/facturas/${xmlFilename}`;

    // ─── Persistir Invoice ───
    // Para CFDI tipo PAGO los importes en el comprobante son 0 (el monto
    // real va dentro del Complemento Pagos20). Persistimos lo que se mandó
    // al provider para mantener consistencia con el XML guardado.
    const invoice = await prisma.invoice.create({
      data: {
        paymentId: data.paymentId || null,
        contractId,
        clientId,
        tipo: data.tipo,
        serie: data.serie,
        folio: nextFolio,
        uuid: timbrado.uuid,
        fechaTimbrado: timbrado.fechaTimbrado,
        status: 'TIMBRADO',
        subtotal: cfdiInput.subtotal,
        iva:      cfdiInput.iva,
        retenciones: 0,
        total:    cfdiInput.total,
        rfcReceptor: cliente.rfc,
        nombreReceptor: nombreReceptor(cliente),
        usoCfdi: data.usoCfdi,
        metodoPago: data.metodoPago,
        formaPago: data.formaPago,
        regimenFiscal: cliente.tipo === 'PM' ? '601' : '612',
        xmlUrl,
        provider: provider.name,
      },
    });

    res.json({
      ok: true,
      invoice,
      provider: provider.name,
      uuid: timbrado.uuid,
      xmlUrl,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Facturar error:', error);
    res.status(500).json({ error: error.message || 'Error al timbrar factura' });
  }
});

// ─── POST /api/invoices/:id/cancelar ─────────────────────────
const cancelarSchema = z.object({
  motivo: z.string().min(1),
});

router.post('/:id/cancelar', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { motivo } = cancelarSchema.parse(req.body);

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    if (invoice.status === 'CANCELADO') {
      return res.status(400).json({ error: 'La factura ya está cancelada' });
    }
    if (invoice.status !== 'TIMBRADO') {
      return res.status(400).json({ error: 'Sólo se pueden cancelar facturas en estatus TIMBRADO' });
    }
    if (!invoice.uuid) {
      return res.status(400).json({ error: 'La factura no tiene UUID (no fue timbrada correctamente)' });
    }

    const provider = getCfdiProvider();
    const result = await provider.cancelar(invoice.uuid, motivo);

    if (!result.ok) {
      return res.status(502).json({ error: 'El provider rechazó la cancelación', acuse: result.acuse });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'CANCELADO',
        motivoCancelacion: motivo,
        fechaCancelacion: result.fechaCancelacion,
      },
    });

    res.json({ ok: true, invoice: updated, acuse: result.acuse });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Cancelar error:', error);
    res.status(500).json({ error: error.message || 'Error al cancelar factura' });
  }
});

// ─── GET /api/invoices ───────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId, clientId, status } = req.query;

    const where: any = {};
    if (contractId) where.contractId = String(contractId);
    if (clientId) where.clientId = String(clientId);
    if (status) where.status = String(status);

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        contract: { select: { folio: true, producto: true } },
        client: {
          select: {
            tipo: true, nombre: true, apellidoPaterno: true,
            razonSocial: true, rfc: true,
          },
        },
        payment: { select: { id: true, periodo: true, fechaPago: true } },
      },
    });

    res.json({
      invoices: invoices.map(inv => ({
        ...inv,
        subtotal: Number(inv.subtotal),
        iva: Number(inv.iva),
        retenciones: Number(inv.retenciones),
        total: Number(inv.total),
      })),
    });
  } catch (error) {
    console.error('List invoices error:', error);
    res.status(500).json({ error: 'Error al listar facturas' });
  }
});

// ─── GET /api/invoices/:id ───────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        contract: { select: { id: true, folio: true, producto: true } },
        client: true,
        payment: true,
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    res.json({
      ...invoice,
      subtotal: Number(invoice.subtotal),
      iva: Number(invoice.iva),
      retenciones: Number(invoice.retenciones),
      total: Number(invoice.total),
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Error al obtener factura' });
  }
});

export default router;
