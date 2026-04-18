import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Catálogo de documentos requeridos por tipo de cliente ──
const DOCS_PFAE = [
  { tipo: 'INE', nombre: 'Identificación oficial (INE/Pasaporte)', requerido: true },
  { tipo: 'CSF', nombre: 'Constancia de Situación Fiscal', requerido: true },
  { tipo: 'CURP', nombre: 'CURP', requerido: true },
  { tipo: 'COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio (máx 3 meses)', requerido: true },
  { tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros (último ejercicio)', requerido: true },
  { tipo: 'DECLARACION_ANUAL', nombre: 'Declaración anual de impuestos', requerido: true },
  { tipo: 'ESTADO_CUENTA_BANCARIO', nombre: 'Estado de cuenta bancario (3 meses)', requerido: true },
  { tipo: 'ACTA_NACIMIENTO', nombre: 'Acta de nacimiento', requerido: false },
  { tipo: 'REFERENCIAS_COMERCIALES', nombre: 'Referencias comerciales', requerido: false },
  { tipo: 'AUTORIZACION_BURO', nombre: 'Autorización de consulta Buró/Círculo', requerido: true },
];

const DOCS_PM = [
  { tipo: 'ACTA_CONSTITUTIVA', nombre: 'Acta constitutiva', requerido: true },
  { tipo: 'PODER_NOTARIAL', nombre: 'Poder notarial del representante legal', requerido: true },
  { tipo: 'INE_REP_LEGAL', nombre: 'INE del representante legal', requerido: true },
  { tipo: 'CSF', nombre: 'Constancia de Situación Fiscal', requerido: true },
  { tipo: 'COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio fiscal', requerido: true },
  { tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros dictaminados (2 ejercicios)', requerido: true },
  { tipo: 'DECLARACION_ANUAL', nombre: 'Declaraciones anuales (2 ejercicios)', requerido: true },
  { tipo: 'ESTADO_CUENTA_BANCARIO', nombre: 'Estados de cuenta bancarios (3 meses)', requerido: true },
  { tipo: 'REGISTRO_PUBLICO', nombre: 'Inscripción en Registro Público de Comercio', requerido: false },
  { tipo: 'REFERENCIAS_COMERCIALES', nombre: 'Referencias comerciales', requerido: false },
  { tipo: 'AUTORIZACION_BURO', nombre: 'Autorización de consulta Buró/Círculo', requerido: true },
  { tipo: 'ACTA_SOCIOS', nombre: 'Acta de asamblea con estructura accionaria', requerido: true },
];

// ─── GET /api/documents/catalogo ────────────────────────────
router.get('/catalogo', requireAuth, async (_req: Request, res: Response) => {
  res.json({ PFAE: DOCS_PFAE, PM: DOCS_PM });
});

// ─── GET /api/documents ─────────────────────────────────────
// Dashboard general: todos los clientes con su estado documental
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId, estado, tipo } = req.query;

    // Si se pide un cliente específico
    if (clientId) {
      const docs = await prisma.clientDocument.findMany({
        where: {
          clientId: clientId as string,
          ...(estado ? { estado: estado as any } : {}),
          ...(tipo ? { tipo: tipo as string } : {}),
        },
        orderBy: [{ requerido: 'desc' }, { tipo: 'asc' }],
      });

      const client = await prisma.client.findUnique({
        where: { id: clientId as string },
        select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true },
      });

      const catalogo = client?.tipo === 'PM' ? DOCS_PM : DOCS_PFAE;
      const existentes = new Set(docs.map(d => d.tipo));
      const faltantes = catalogo.filter(c => !existentes.has(c.tipo));

      return res.json({
        client,
        documentos: docs,
        faltantes,
        resumen: {
          total: catalogo.length,
          recibidos: docs.filter(d => d.estado === 'RECIBIDO').length,
          pendientes: docs.filter(d => d.estado === 'PENDIENTE').length,
          vencidos: docs.filter(d => d.estado === 'VENCIDO').length,
          rechazados: docs.filter(d => d.estado === 'RECHAZADO').length,
          sinRegistrar: faltantes.length,
          completo: faltantes.filter(f => f.requerido).length === 0 &&
            docs.filter(d => d.requerido && d.estado !== 'RECIBIDO').length === 0,
        },
      });
    }

    // Dashboard general
    const clients = await prisma.client.findMany({
      where: { activo: true },
      select: {
        id: true, tipo: true, nombre: true, apellidoPaterno: true,
        razonSocial: true, rfc: true,
        documentos: { select: { tipo: true, estado: true, requerido: true } },
        contratos: { where: { estatus: { in: ['VIGENTE', 'EN_PROCESO'] } }, select: { id: true, folio: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const dashboard = clients.map(c => {
      const catalogo = c.tipo === 'PM' ? DOCS_PM : DOCS_PFAE;
      const existentes = new Set(c.documentos.map(d => d.tipo));
      const faltantesReq = catalogo.filter(cat => cat.requerido && !existentes.has(cat.tipo));
      const pendientes = c.documentos.filter(d => d.estado === 'PENDIENTE');
      const vencidos = c.documentos.filter(d => d.estado === 'VENCIDO');
      const recibidos = c.documentos.filter(d => d.estado === 'RECIBIDO');
      const totalReq = catalogo.filter(cat => cat.requerido).length;

      return {
        id: c.id,
        tipo: c.tipo,
        nombre: c.tipo === 'PM' ? c.razonSocial : `${c.nombre} ${c.apellidoPaterno}`,
        rfc: c.rfc,
        contratosActivos: c.contratos.length,
        documentos: {
          total: catalogo.length,
          requeridos: totalReq,
          recibidos: recibidos.length,
          pendientes: pendientes.length,
          vencidos: vencidos.length,
          faltantes: faltantesReq.length,
        },
        porcentaje: Math.round(((recibidos.length) / totalReq) * 100),
        completo: faltantesReq.length === 0 && pendientes.filter(d => d.requerido).length === 0,
        alertas: faltantesReq.length + vencidos.length,
      };
    });

    // Resumen global
    const totalClientes = dashboard.length;
    const expedientesCompletos = dashboard.filter(d => d.completo).length;
    const totalAlertas = dashboard.reduce((s, d) => s + d.alertas, 0);

    res.json({
      data: dashboard,
      summary: {
        totalClientes,
        expedientesCompletos,
        expedientesIncompletos: totalClientes - expedientesCompletos,
        totalAlertas,
        porcentajeGlobal: totalClientes > 0
          ? Math.round((expedientesCompletos / totalClientes) * 100)
          : 0,
      },
    });
  } catch (error) {
    console.error('Documents error:', error);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
});

// ─── POST /api/documents ────────────────────────────────────
// Registrar un documento (o crear el checklist completo)
const docSchema = z.object({
  clientId: z.string().min(1),
  tipo: z.string().min(1),
  nombre: z.string().min(1),
  requerido: z.boolean().default(true),
  estado: z.enum(['PENDIENTE', 'RECIBIDO', 'VENCIDO', 'RECHAZADO']).default('PENDIENTE'),
  archivoUrl: z.string().optional(),
  fechaRecepcion: z.string().optional(),
  fechaVencimiento: z.string().optional(),
  observaciones: z.string().optional(),
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = docSchema.parse(req.body);
    const doc = await prisma.clientDocument.create({
      data: {
        ...data,
        fechaRecepcion: data.fechaRecepcion ? new Date(data.fechaRecepcion) : null,
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
      },
    });
    res.status(201).json(doc);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Error al crear documento' });
  }
});

// ─── POST /api/documents/init-checklist ─────────────────────
// Inicializar el checklist completo para un cliente
router.post('/init-checklist', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { tipo: true },
    });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const catalogo = client.tipo === 'PM' ? DOCS_PM : DOCS_PFAE;

    // Verificar qué documentos ya existen
    const existing = await prisma.clientDocument.findMany({
      where: { clientId },
      select: { tipo: true },
    });
    const existingTipos = new Set(existing.map(d => d.tipo));

    const toCreate = catalogo.filter(c => !existingTipos.has(c.tipo));
    if (toCreate.length === 0) {
      return res.json({ message: 'Checklist ya existe', created: 0 });
    }

    await prisma.clientDocument.createMany({
      data: toCreate.map(c => ({
        clientId,
        tipo: c.tipo,
        nombre: c.nombre,
        requerido: c.requerido,
        estado: 'PENDIENTE' as const,
      })),
    });

    res.json({ created: toCreate.length, tipos: toCreate.map(c => c.tipo) });
  } catch (error) {
    console.error('Init checklist error:', error);
    res.status(500).json({ error: 'Error al inicializar checklist' });
  }
});

// ─── PUT /api/documents/:id ─────────────────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = docSchema.partial().parse(req.body);
    const doc = await prisma.clientDocument.update({
      where: { id: req.params.id },
      data: {
        ...data,
        fechaRecepcion: data.fechaRecepcion ? new Date(data.fechaRecepcion) : undefined,
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : undefined,
      },
    });
    res.json(doc);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

// ─── DELETE /api/documents/:id ──────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.clientDocument.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

export default router;
