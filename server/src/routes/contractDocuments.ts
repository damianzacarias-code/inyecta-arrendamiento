import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Catálogo de documentos requeridos por etapa del contrato ──
type StageDoc = { tipo: string; nombre: string; requerido: boolean };

export const STAGE_DOCS: Record<string, StageDoc[]> = {
  SOLICITUD: [
    { tipo: 'SOLICITUD_FIRMADA', nombre: 'Solicitud de arrendamiento firmada', requerido: true },
    { tipo: 'AUTORIZACION_BURO', nombre: 'Autorización de consulta a Buró/Círculo', requerido: true },
  ],
  ANALISIS_CLIENTE: [
    { tipo: 'REPORTE_BURO', nombre: 'Reporte de Buró/Círculo de Crédito', requerido: true },
    { tipo: 'ANALISIS_FINANCIERO', nombre: 'Análisis financiero del solicitante', requerido: true },
    { tipo: 'VERIFICACION_DOMICILIO', nombre: 'Verificación de domicilio (visita ocular)', requerido: false },
  ],
  ANALISIS_BIEN: [
    { tipo: 'COTIZACION_PROVEEDOR', nombre: 'Cotización formal del proveedor del bien', requerido: true },
    { tipo: 'FACTURA_PROFORMA', nombre: 'Factura proforma o pedido', requerido: true },
    { tipo: 'FICHA_TECNICA_BIEN', nombre: 'Ficha técnica del bien', requerido: false },
    { tipo: 'AVALUO_BIEN', nombre: 'Avalúo del bien (si es usado)', requerido: false },
  ],
  COMITE: [
    { tipo: 'DICTAMEN_COMITE', nombre: 'Dictamen del Comité de Crédito', requerido: true },
    { tipo: 'MINUTA_COMITE', nombre: 'Minuta de la sesión de comité', requerido: false },
  ],
  FORMALIZACION: [
    { tipo: 'CONTRATO_FIRMADO', nombre: 'Contrato de arrendamiento firmado', requerido: true },
    { tipo: 'PAGARE', nombre: 'Pagaré por el monto del financiamiento', requerido: true },
    { tipo: 'POLIZA_SEGURO', nombre: 'Póliza de seguro vigente', requerido: true },
    { tipo: 'AVAL_FIRMADO', nombre: 'Documentación del aval/obligado solidario', requerido: false },
  ],
  DESEMBOLSO: [
    { tipo: 'FACTURA_BIEN', nombre: 'Factura del bien a nombre de Inyecta', requerido: true },
    { tipo: 'COMPROBANTE_TRANSFERENCIA', nombre: 'Comprobante de transferencia al proveedor', requerido: true },
    { tipo: 'COMPROBANTE_DEPOSITO_GARANTIA', nombre: 'Comprobante de depósito en garantía', requerido: true },
    { tipo: 'COMPROBANTE_RENTA_INICIAL', nombre: 'Comprobante de renta inicial', requerido: false },
    { tipo: 'INSTALACION_GPS', nombre: 'Comprobante de instalación de GPS', requerido: false },
  ],
  ACTIVO: [
    { tipo: 'ACTA_ENTREGA', nombre: 'Acta de entrega-recepción del bien', requerido: true },
    { tipo: 'CARTA_BIENVENIDA', nombre: 'Carta de bienvenida y datos de pago', requerido: false },
  ],
};

const STAGE_ORDER = ['SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO'];

// ─── GET /api/contract-documents/catalogo ───────────────────
router.get('/catalogo', requireAuth, async (_req: Request, res: Response) => {
  res.json(STAGE_DOCS);
});

// ─── GET /api/contract-documents/contract/:contractId ───────
// Devuelve la lista de documentos requeridos por etapa, mezclando catálogo
// con lo que ya está en BD. Crea los registros faltantes en PENDIENTE.
router.get('/contract/:contractId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, etapa: true, estatus: true },
    });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const existentes = await prisma.contractDocument.findMany({
      where: { contractId },
      include: { uploadedByUser: { select: { nombre: true, apellidos: true } } },
    });

    // Sembrar registros faltantes (uno por entrada en STAGE_DOCS)
    const presentes = new Set(existentes.map(d => `${d.etapa}:${d.tipo}`));
    const aCrear: { contractId: string; etapa: any; tipo: string; nombre: string; requerido: boolean }[] = [];
    for (const [etapa, docs] of Object.entries(STAGE_DOCS)) {
      for (const d of docs) {
        if (!presentes.has(`${etapa}:${d.tipo}`)) {
          aCrear.push({ contractId, etapa: etapa as any, tipo: d.tipo, nombre: d.nombre, requerido: d.requerido });
        }
      }
    }

    if (aCrear.length > 0) {
      await prisma.contractDocument.createMany({ data: aCrear });
    }

    const todos = await prisma.contractDocument.findMany({
      where: { contractId },
      include: { uploadedByUser: { select: { nombre: true, apellidos: true } } },
    });

    // Agrupar por etapa y calcular progreso
    const porEtapa = STAGE_ORDER.map(et => {
      const docs = todos.filter(d => d.etapa === et);
      const requeridos = docs.filter(d => d.requerido);
      const completos = requeridos.filter(d => d.estado === 'RECIBIDO').length;
      return {
        etapa: et,
        currentStage: contract.etapa === et,
        pasada: STAGE_ORDER.indexOf(et) < STAGE_ORDER.indexOf(contract.etapa),
        total: requeridos.length,
        completos,
        progreso: requeridos.length > 0 ? Math.round((completos / requeridos.length) * 100) : 100,
        documentos: docs.sort((a, b) => Number(b.requerido) - Number(a.requerido)),
      };
    });

    res.json({
      contractId,
      etapaActual: contract.etapa,
      etapas: porEtapa,
    });
  } catch (err) {
    console.error('Get contract docs error:', err);
    res.status(500).json({ error: 'Error al obtener documentos del contrato' });
  }
});

// ─── PATCH /api/contract-documents/:id ──────────────────────
const updateSchema = z.object({
  estado: z.enum(['PENDIENTE', 'RECIBIDO', 'VENCIDO', 'RECHAZADO']).optional(),
  archivoUrl: z.string().nullable().optional(),
  archivoNombre: z.string().nullable().optional(),
  fechaRecepcion: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = updateSchema.parse(req.body);

    const update: any = { ...data };
    if (data.fechaRecepcion) update.fechaRecepcion = new Date(data.fechaRecepcion);
    // Si marcan RECIBIDO sin fecha, usar la de ahora; y registrar quién subió.
    if (data.estado === 'RECIBIDO') {
      update.fechaRecepcion = update.fechaRecepcion || new Date();
      update.uploadedBy = userId;
    }

    const doc = await prisma.contractDocument.update({
      where: { id: req.params.id },
      data: update,
    });
    res.json(doc);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Update contract doc error:', err);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

// ─── POST /api/contract-documents ───────────────────────────
// Documento adicional fuera del catálogo
const createSchema = z.object({
  contractId: z.string().min(1),
  etapa: z.enum(['SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO']),
  tipo: z.string().min(1),
  nombre: z.string().min(1),
  requerido: z.boolean().optional(),
});
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const doc = await prisma.contractDocument.create({
      data: { ...data, requerido: data.requerido ?? false },
    });
    res.json(doc);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Create contract doc error:', err);
    res.status(500).json({ error: 'Error al crear documento' });
  }
});

// ─── DELETE /api/contract-documents/:id ─────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.contractDocument.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete contract doc error:', err);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

export default router;
