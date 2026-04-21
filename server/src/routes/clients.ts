import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { childLogger } from '../lib/logger';
import { createClientSchema, updateClientSchema } from '../schemas/client';

const log = childLogger('clients');

const router = Router();

// ── Schemas locales (solo update de documentos) ──────────────────
// El schema del Cliente vive en src/schemas/client.ts porque es
// compartido con el wizard del frontend y con los tests de
// validación condicional KYC.

const updateDocumentSchema = z.object({
  estado: z.enum(['PENDIENTE', 'RECIBIDO', 'VENCIDO', 'RECHAZADO']),
  observaciones: z.string().optional(),
  fechaVencimiento: z.string().optional(),
});

// ── Document requirements per type ───────────────────────────────

const pfaeDocuments = [
  { tipo: 'AUTORIZACION_BURO', nombre: 'Autorizacion para consulta en Buro de Credito', requerido: true },
  { tipo: 'INE', nombre: 'Identificacion oficial vigente (INE o Pasaporte)', requerido: true },
  { tipo: 'ACTA_NACIMIENTO', nombre: 'Acta de Nacimiento', requerido: true },
  { tipo: 'ACTA_MATRIMONIO', nombre: 'Acta de Matrimonio o de Divorcio', requerido: false },
  { tipo: 'CSF', nombre: 'Constancia de Situacion Fiscal (max. 3 meses)', requerido: true },
  { tipo: 'COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio vigente (max. 3 meses)', requerido: true },
  { tipo: 'OPINION_FISCAL', nombre: 'Opinion de Cumplimiento de Obligaciones Fiscales', requerido: true },
  { tipo: 'OPINION_IMSS', nombre: 'Opinion de Cumplimiento del IMSS o ultimo pago', requerido: true },
  { tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros (cierre ultimo ejercicio y parcial)', requerido: true },
  { tipo: 'ESTADOS_CUENTA', nombre: 'Estados de cuenta bancarios (ultimos 12 meses)', requerido: true },
  { tipo: 'DECLARACION_ANUAL', nombre: 'Declaracion anual de impuestos (ultimo ejercicio)', requerido: true },
  { tipo: 'DECLARACION_PARCIAL', nombre: 'Declaracion parcial de impuestos (ultimo mes)', requerido: true },
];

const pmDocuments = [
  { tipo: 'AUTORIZACION_BURO', nombre: 'Autorizacion para consulta en Buro de Credito', requerido: true },
  { tipo: 'CSF', nombre: 'Constancia de Situacion Fiscal (max. 3 meses)', requerido: true },
  { tipo: 'COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio vigente (max. 3 meses)', requerido: true },
  { tipo: 'OPINION_FISCAL', nombre: 'Opinion de Cumplimiento de Obligaciones Fiscales', requerido: true },
  { tipo: 'OPINION_IMSS', nombre: 'Opinion de Cumplimiento del IMSS o ultimo pago', requerido: true },
  { tipo: 'ACTA_CONSTITUTIVA', nombre: 'Acta Constitutiva con boleta Reg. Publico del Comercio', requerido: true },
  { tipo: 'ACTAS_ASAMBLEA', nombre: 'Actas de Asamblea y Poderes con inscripcion', requerido: true },
  { tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros (cierre ultimo ejercicio y parcial)', requerido: true },
  { tipo: 'ESTADOS_CUENTA', nombre: 'Estados de cuenta bancarios (ultimos 12 meses)', requerido: true },
  { tipo: 'DECLARACION_ANUAL', nombre: 'Declaracion anual de impuestos (ultimo ejercicio)', requerido: true },
  { tipo: 'DECLARACION_PARCIAL', nombre: 'Declaracion parcial de impuestos (ultimo mes)', requerido: true },
  { tipo: 'RL_INE', nombre: 'Rep. Legal / Socios - INE o Pasaporte', requerido: true },
  { tipo: 'RL_ACTA_NACIMIENTO', nombre: 'Rep. Legal / Socios - Acta de Nacimiento', requerido: true },
  { tipo: 'RL_ACTA_MATRIMONIO', nombre: 'Rep. Legal / Socios - Acta de Matrimonio/Divorcio', requerido: false },
  { tipo: 'RL_CSF', nombre: 'Rep. Legal / Socios - Constancia de Situacion Fiscal', requerido: true },
  { tipo: 'RL_COMPROBANTE_DOMICILIO', nombre: 'Rep. Legal / Socios - Comprobante de domicilio', requerido: true },
];

// ── POST /api/clients - Crear cliente ────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createClientSchema.parse(req.body);

    // Check RFC duplicado
    if (data.rfc) {
      const existing = await prisma.client.findUnique({ where: { rfc: data.rfc } });
      if (existing) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese RFC' });
      }
    }

    // Separar los bloques anidados del resto de columnas del Client
    const { representanteLegal, socios, ...clientCols } = data;

    // Crear cliente + RL (si viene) + socios (si PM) en una transacción
    // para que no queden huérfanos si cualquier paso falla.
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({ data: clientCols as any });

      if (representanteLegal) {
        await tx.representanteLegal.create({
          data: {
            ...representanteLegal,
            clientId: created.id,
          } as any,
        });
      }

      if (socios && socios.length > 0) {
        await tx.shareholder.createMany({
          data: socios.map((s) => ({
            ...s,
            porcentaje: String(s.porcentaje),
            clientId: created.id,
          })) as any,
        });
      }

      return created;
    });

    // Auto-crear checklist de documentos (fuera de la transacción —
    // si falla, el cliente queda creado; el checklist se puede regenerar)
    const docs = data.tipo === 'PFAE' ? pfaeDocuments : pmDocuments;
    await prisma.clientDocument.createMany({
      data: docs.map(d => ({
        clientId: client.id,
        tipo: d.tipo,
        nombre: d.nombre,
        requerido: d.requerido,
        estado: 'PENDIENTE' as const,
      })),
    });

    // Reload completo con todas las relaciones KYC
    const clientFull = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        documentos: { orderBy: { requerido: 'desc' } },
        avales: true,
        socios: true,
        representanteLegalData: true,
      },
    });

    return res.status(201).json(clientFull);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    log.error({ err: error }, 'Create client error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── GET /api/clients - Listar clientes ───────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', search, tipo } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { activo: true };
    if (tipo) where.tipo = tipo;
    if (search) {
      const s = search as string;
      where.OR = [
        { nombre: { contains: s, mode: 'insensitive' } },
        { apellidoPaterno: { contains: s, mode: 'insensitive' } },
        { razonSocial: { contains: s, mode: 'insensitive' } },
        { rfc: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          documentos: { select: { id: true, estado: true, requerido: true } },
          _count: { select: { cotizaciones: true, contratos: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    // Add document progress
    const enriched = clients.map(c => {
      const totalDocs = c.documentos.length;
      const recibidos = c.documentos.filter(d => d.estado === 'RECIBIDO').length;
      const requeridosTotal = c.documentos.filter(d => d.requerido).length;
      const requeridosRecibidos = c.documentos.filter(d => d.requerido && d.estado === 'RECIBIDO').length;
      return {
        ...c,
        documentos: undefined,
        docProgress: { total: totalDocs, recibidos, requeridosTotal, requeridosRecibidos },
      };
    });

    return res.json({
      data: enriched,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
    });
  } catch (error) {
    log.error({ err: error }, 'List clients error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── GET /api/clients/:id - Detalle cliente ───────────────────────

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        documentos: { orderBy: [{ requerido: 'desc' }, { tipo: 'asc' }] },
        avales: true,
        socios: true,
        representanteLegalData: true,
        cotizaciones: {
          select: { id: true, folio: true, producto: true, valorBien: true, rentaMensualIVA: true, plazo: true, estado: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        contratos: {
          select: { id: true, folio: true, producto: true, montoFinanciar: true, etapa: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        notas: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { nombre: true, apellidos: true } } },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    return res.json(client);
  } catch (error) {
    log.error({ err: error }, 'Get client error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── PUT /api/clients/:id - Actualizar cliente ────────────────────

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Validar shape parcial (sin regenerar reglas condicionales de creación,
    // ya que el registro existe y solo se actualiza lo enviado).
    const parsed = updateClientSchema.parse(req.body);

    // Separar bloques anidados de columnas del Client. `tipo` NO se
    // actualiza post-creación: las reglas condicionales (PFAE/PM)
    // dependen de él. Si el usuario necesita cambiar tipo, debe crear
    // otro Client.
    const {
      representanteLegal,
      socios,
      tipo: _tipoIgnored, // no se actualiza
      ...clientCols
    } = parsed;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(clientCols).length > 0) {
        await tx.client.update({
          where: { id: req.params.id },
          data: clientCols as any,
        });
      }

      // Upsert del representante legal (1:1). Si el cliente ya tiene
      // uno, se actualiza; si no, se crea.
      if (representanteLegal) {
        await tx.representanteLegal.upsert({
          where: { clientId: req.params.id },
          update: representanteLegal as any,
          create: {
            ...representanteLegal,
            clientId: req.params.id,
          } as any,
        });
      }

      // Socios: la actualización completa borra los anteriores y re-crea
      // (strategy "replace"). No intentamos hacer diff porcentajes.
      // El frontend siempre debe enviar la lista completa o omitir.
      if (Array.isArray(socios)) {
        await tx.shareholder.deleteMany({ where: { clientId: req.params.id } });
        if (socios.length > 0) {
          await tx.shareholder.createMany({
            data: socios.map((s) => ({
              ...s,
              porcentaje: String(s.porcentaje),
              clientId: req.params.id,
            })) as any,
          });
        }
      }
    });

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        documentos: { orderBy: [{ requerido: 'desc' }, { tipo: 'asc' }] },
        avales: true,
        socios: true,
        representanteLegalData: true,
      },
    });

    return res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    log.error({ err: error }, 'Update client error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── PUT /api/clients/:id/documents/:docId - Actualizar estado doc ─

router.put('/:id/documents/:docId', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = updateDocumentSchema.parse(req.body);

    const doc = await prisma.clientDocument.findFirst({
      where: { id: req.params.docId, clientId: req.params.id },
    });
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const updated = await prisma.clientDocument.update({
      where: { id: req.params.docId },
      data: {
        estado: data.estado as any,
        fechaRecepcion: data.estado === 'RECIBIDO' ? new Date() : doc.fechaRecepcion,
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : doc.fechaVencimiento,
        observaciones: data.observaciones ?? doc.observaciones,
      },
    });

    return res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Update document error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── POST /api/clients/:id/notes - Agregar nota ──────────────────

router.post('/:id/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contenido } = req.body;
    if (!contenido?.trim()) return res.status(400).json({ error: 'Contenido requerido' });

    const note = await prisma.note.create({
      data: {
        clientId: req.params.id,
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
