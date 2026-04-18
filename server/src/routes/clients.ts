import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ── Schemas ──────────────────────────────────────────────────────

const createClientSchema = z.object({
  tipo: z.enum(['PFAE', 'PM']),
  // PF
  nombre: z.string().optional(),
  apellidoPaterno: z.string().optional(),
  apellidoMaterno: z.string().optional(),
  curp: z.string().optional(),
  // PM
  razonSocial: z.string().optional(),
  // Compartidos
  rfc: z.string().min(12).max(13).optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  // Domicilio fiscal
  calle: z.string().optional(),
  numExterior: z.string().optional(),
  numInterior: z.string().optional(),
  colonia: z.string().optional(),
  municipio: z.string().optional(),
  ciudad: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  // Domicilio operacion
  calleOp: z.string().optional(),
  numExteriorOp: z.string().optional(),
  numInteriorOp: z.string().optional(),
  coloniaOp: z.string().optional(),
  municipioOp: z.string().optional(),
  ciudadOp: z.string().optional(),
  estadoOp: z.string().optional(),
  cpOp: z.string().optional(),
  // PM especificos
  actaConstitutiva: z.string().optional(),
  registroPublico: z.string().optional(),
  representanteLegal: z.string().optional(),
  // Meta
  sector: z.string().optional(),
  actividadEconomica: z.string().optional(),
}).refine(data => {
  if (data.tipo === 'PFAE') return !!data.nombre && !!data.apellidoPaterno;
  if (data.tipo === 'PM') return !!data.razonSocial;
  return false;
}, { message: 'PFAE requiere nombre y apellido. PM requiere razon social.' });

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

    const client = await prisma.client.create({ data: data as any });

    // Auto-crear checklist de documentos
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

    // Reload con documentos
    const clientFull = await prisma.client.findUnique({
      where: { id: client.id },
      include: { documentos: { orderBy: { requerido: 'desc' } }, avales: true, socios: true },
    });

    return res.status(201).json(clientFull);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create client error:', error);
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
    console.error('List clients error:', error);
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
    console.error('Get client error:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── PUT /api/clients/:id - Actualizar cliente ────────────────────

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Permitimos update parcial
    const { id, createdAt, updatedAt, documentos, avales, socios, cotizaciones, contratos, notas, ...updateData } = req.body;

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        documentos: { orderBy: [{ requerido: 'desc' }, { tipo: 'asc' }] },
        avales: true,
        socios: true,
      },
    });

    return res.json(client);
  } catch (error) {
    console.error('Update client error:', error);
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
    console.error('Update document error:', error);
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
    console.error('Create note error:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
