/**
 * /api/contracts/:contractId/avales — Avales (Deudores Solidarios) por contrato
 * --------------------------------------------------------------------------
 *
 * El expediente legacy guardaba al aval como ExpedienteActor con
 * datosAdicionales: Json no tipado. Esta ruta opera sobre el modelo
 * `Aval` (schema.prisma) que estructura los datos demográficos
 * completos exigidos por las cláusulas:
 *   • PURO § VIGÉSIMA CUARTA. Deudor Solidario y/o Avalista
 *   • FIN  § DÉCIMA QUINTA.   Deudor Solidario y/o Avalista
 *
 * El aval renuncia a beneficios de orden, excusión y división y se
 * obliga a no enajenar sus bienes — por eso capturamos régimen
 * matrimonial y datos del cónyuge: si es sociedad conyugal, el cónyuge
 * co-grava el patrimonio.
 *
 * Endpoints:
 *   GET    /api/contracts/:contractId/avales            → lista
 *   POST   /api/contracts/:contractId/avales            → alta
 *   GET    /api/contracts/:contractId/avales/:id        → detalle
 *   PATCH  /api/contracts/:contractId/avales/:id        → edición parcial
 *   DELETE /api/contracts/:contractId/avales/:id        → baja física
 *
 * Auth: requireAuth + roles operativos (ADMIN, DIRECTOR, ANALISTA, LEGAL,
 * OPERACIONES). COBRANZA no puede tocar avales.
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router({ mergeParams: true });

// ── Schemas Zod ─────────────────────────────────────────────────────

const tipoSchema = z.enum(['PFAE', 'PM']);
const estadoCivilSchema = z.enum(['SOLTERO', 'CASADO']);
const regimenMatrimonialSchema = z.enum(['SEPARACION_BIENES', 'SOCIEDAD_CONYUGAL']);

// Acepta ISO date string ó null. Cualquier otro tipo rebota como
// VALIDATION_ERROR vía errorHandler central.
const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

const baseAvalSchema = z.object({
  orden: z.number().int().min(1).max(10).optional(),
  tipo: tipoSchema,

  // Identidad
  nombre: z.string().trim().min(1, 'Nombre obligatorio').max(120),
  apellidoPaterno: z.string().trim().max(120).optional().nullable(),
  apellidoMaterno: z.string().trim().max(120).optional().nullable(),
  rfc: z.string().trim().toUpperCase().max(13).optional().nullable(),
  curp: z.string().trim().toUpperCase().max(18).optional().nullable(),
  fiel: z.string().trim().max(120).optional().nullable(),
  fechaNacimiento: optionalDate,
  lugarNacimiento: z.string().trim().max(120).optional().nullable(),
  nacionalidad: z.string().trim().max(60).optional().nullable(),

  estadoCivil: estadoCivilSchema.optional().nullable(),
  regimenMatrimonial: regimenMatrimonialSchema.optional().nullable(),
  nombreConyuge: z.string().trim().max(180).optional().nullable(),
  rfcConyuge: z.string().trim().toUpperCase().max(13).optional().nullable(),

  // Domicilio
  calle: z.string().trim().max(180).optional().nullable(),
  numExterior: z.string().trim().max(20).optional().nullable(),
  numInterior: z.string().trim().max(20).optional().nullable(),
  colonia: z.string().trim().max(120).optional().nullable(),
  municipio: z.string().trim().max(120).optional().nullable(),
  ciudad: z.string().trim().max(120).optional().nullable(),
  estado: z.string().trim().max(120).optional().nullable(),
  pais: z.string().trim().max(60).optional().nullable(),
  cp: z.string().trim().max(10).optional().nullable(),

  // Contacto
  telefono: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email('Email inválido').optional().nullable().or(z.literal('').transform(() => null)),

  // Si es PM
  razonSocial: z.string().trim().max(200).optional().nullable(),
  fechaConstitucion: optionalDate,
  folioMercantil: z.string().trim().max(60).optional().nullable(),
  notarioConstNombre: z.string().trim().max(180).optional().nullable(),
  notarioConstNumero: z.string().trim().max(20).optional().nullable(),
  notarioConstLugar: z.string().trim().max(120).optional().nullable(),
  repLegalNombre: z.string().trim().max(180).optional().nullable(),
  repLegalRfc: z.string().trim().toUpperCase().max(13).optional().nullable(),
  poderEscrituraNumero: z.string().trim().max(60).optional().nullable(),
  poderEscrituraFecha: optionalDate,
  poderNotarioNombre: z.string().trim().max(180).optional().nullable(),
});

const createAvalSchema = baseAvalSchema.superRefine((data, ctx) => {
  // Si es PM, exigimos al menos razonSocial. Si es PFAE, no debería tener razonSocial.
  if (data.tipo === 'PM' && !data.razonSocial) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['razonSocial'],
      message: 'Razón social obligatoria para aval PM',
    });
  }
  // Coherencia: si estadoCivil=CASADO, exige régimen matrimonial.
  if (data.estadoCivil === 'CASADO' && !data.regimenMatrimonial) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['regimenMatrimonial'],
      message: 'Régimen matrimonial obligatorio cuando estadoCivil=CASADO',
    });
  }
});

const updateAvalSchema = baseAvalSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Sin cambios' },
);

// ── Helpers ─────────────────────────────────────────────────────────

async function ensureContract(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!c) throw new AppError('CONTRACT_NOT_FOUND', 'Contrato no encontrado', 404);
}

// ── Rutas ───────────────────────────────────────────────────────────

router.use(requireAuth);

// GET — listado
router.get(
  '/',
  requireRole('ADMIN', 'DIRECTOR', 'ANALISTA', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req, res) => {
    const { contractId } = req.params as { contractId: string };
    await ensureContract(contractId);
    const avales = await prisma.aval.findMany({
      where: { contractId },
      orderBy: { orden: 'asc' },
    });
    res.json({ avales });
  }),
);

// POST — alta
router.post(
  '/',
  requireRole('ADMIN', 'DIRECTOR', 'ANALISTA', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req, res) => {
    const { contractId } = req.params as { contractId: string };
    await ensureContract(contractId);
    const data = createAvalSchema.parse(req.body);

    // Si no se especificó orden, asigna el siguiente disponible (max+1).
    let orden = data.orden;
    if (!orden) {
      const max = await prisma.aval.aggregate({
        where: { contractId },
        _max: { orden: true },
      });
      orden = (max._max.orden ?? 0) + 1;
    }

    const aval = await prisma.aval.create({
      data: { ...data, orden, contractId },
    });
    res.status(201).json({ aval });
  }),
);

// GET :id — detalle
router.get(
  '/:id',
  requireRole('ADMIN', 'DIRECTOR', 'ANALISTA', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req, res) => {
    const { contractId, id } = req.params as { contractId: string; id: string };
    const aval = await prisma.aval.findFirst({ where: { id, contractId } });
    if (!aval) throw new AppError('AVAL_NOT_FOUND', 'Aval no encontrado', 404);
    res.json({ aval });
  }),
);

// PATCH — edición parcial
router.patch(
  '/:id',
  requireRole('ADMIN', 'DIRECTOR', 'ANALISTA', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req, res) => {
    const { contractId, id } = req.params as { contractId: string; id: string };
    const data = updateAvalSchema.parse(req.body);
    const existing = await prisma.aval.findFirst({ where: { id, contractId } });
    if (!existing) throw new AppError('AVAL_NOT_FOUND', 'Aval no encontrado', 404);
    const aval = await prisma.aval.update({ where: { id }, data });
    res.json({ aval });
  }),
);

// DELETE — baja física (no hay relaciones colgantes)
router.delete(
  '/:id',
  requireRole('ADMIN', 'DIRECTOR', 'LEGAL'),
  asyncHandler(async (req, res) => {
    const { contractId, id } = req.params as { contractId: string; id: string };
    const existing = await prisma.aval.findFirst({ where: { id, contractId } });
    if (!existing) throw new AppError('AVAL_NOT_FOUND', 'Aval no encontrado', 404);
    await prisma.aval.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

export default router;
