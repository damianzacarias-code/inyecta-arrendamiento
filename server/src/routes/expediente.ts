/**
 * routes/expediente.ts
 * ──────────────────────────────────────────────────────────────────
 * Expediente documental por actor — endpoints REST.
 *
 * Modelo:
 *   Contract 1—N ExpedienteActor 1—N ExpedienteDocumento
 *
 * Actores fijos (sembrados al crear contrato): OPERACION, SOLICITANTE,
 * REPRESENTANTE_LEGAL (PM), PRINCIPAL_ACCIONISTA (PM), BIEN_ARRENDADO,
 * FORMALIZACION. AVAL es 0..N y se agrega manualmente.
 *
 * Endpoints:
 *   GET    /api/contracts/:id/expediente
 *          → { contract, cobertura, actores: [{ ...actor, catalogo, documentos }] }
 *
 *   GET    /api/contracts/:id/expediente/catalogos
 *          → catálogos por tipo de actor para el frontend (sin tocar BD)
 *
 *   POST   /api/contracts/:id/expediente/actores
 *          → crea un actor (típicamente AVAL); el orden se autocalcula
 *
 *   PATCH  /api/expediente/actores/:actorId
 *          → renombrar, agregar RFC, datosAdicionales (JSON libre)
 *
 *   DELETE /api/expediente/actores/:actorId
 *          → solo permitido para AVAL (los fijos están bloqueados)
 *
 *   POST   /api/expediente/actores/:actorId/documentos
 *          → upload (multer.single 'archivo') + metadatos del documento
 *
 *   PATCH  /api/expediente/documentos/:docId
 *          → toggle físico/digital, cambiar estatus, editar notas/tipo
 *
 *   DELETE /api/expediente/documentos/:docId
 *          → elimina registro y borra el archivo del disco
 *
 * Autorización:
 *   Todos los endpoints requieren auth. Borrado de actores y
 *   documentos restringido a ADMIN/DIRECTOR/LEGAL/OPERACIONES.
 *   Lectura disponible para cualquier rol autenticado.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { ActorTipo, ActorSubtipo } from '@prisma/client';
import prisma from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadExpediente, publicUrl, deleteIfExists } from '../middleware/upload';
import {
  catalogoParaActor,
  etiquetaActor,
  esActorFijo,
  calcularCobertura,
} from '../services/expedienteCatalogs';
import { childLogger } from '../lib/logger';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const log = childLogger('expediente');

// ───────────────────────────────────────────────────────────────────
// Schemas Zod
// ───────────────────────────────────────────────────────────────────

const ACTOR_TIPOS = [
  'OPERACION',
  'SOLICITANTE',
  'REPRESENTANTE_LEGAL',
  'PRINCIPAL_ACCIONISTA',
  'AVAL',
  'BIEN_ARRENDADO',
  'FORMALIZACION',
] as const satisfies readonly ActorTipo[];

const ACTOR_SUBTIPOS = ['PF', 'PM'] as const satisfies readonly ActorSubtipo[];

const DOCUMENTO_ESTATUS = ['PENDIENTE', 'VALIDADO', 'RECHAZADO'] as const;

/** Crear nuevo actor (típicamente AVAL). */
const createActorSchema = z.object({
  tipo: z.enum(ACTOR_TIPOS),
  subtipo: z.enum(ACTOR_SUBTIPOS).nullable().optional(),
  nombre: z.string().min(1).max(200).nullable().optional(),
  rfc: z.string().min(1).max(20).nullable().optional(),
  datosAdicionales: z.record(z.unknown()).nullable().optional(),
});

/** Editar actor existente (todos los campos opcionales). */
const updateActorSchema = z.object({
  nombre: z.string().min(1).max(200).nullable().optional(),
  rfc: z.string().min(1).max(20).nullable().optional(),
  subtipo: z.enum(ACTOR_SUBTIPOS).nullable().optional(),
  datosAdicionales: z.record(z.unknown()).nullable().optional(),
});

/**
 * Metadatos al subir un documento. El archivo viene en `req.file`
 * (multer); este schema valida el resto del body.
 */
const uploadDocumentoSchema = z.object({
  tipoDocumento: z.string().min(1).max(80).nullable().optional(),
  tieneFisico: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  tieneDigital: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  estatus: z.enum(DOCUMENTO_ESTATUS).optional(),
  notas: z.string().max(500).nullable().optional(),
});

/** Actualización parcial de un documento (toggle, estatus, notas, tipo). */
const updateDocumentoSchema = z.object({
  tipoDocumento: z.string().min(1).max(80).nullable().optional(),
  tieneFisico: z.boolean().optional(),
  tieneDigital: z.boolean().optional(),
  estatus: z.enum(DOCUMENTO_ESTATUS).optional(),
  notas: z.string().max(500).nullable().optional(),
});

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

/**
 * Carga un contrato verificando existencia. Tira AppError 404 si no.
 * Solo selecciona los campos que el expediente necesita (id, tipoTitular).
 */
async function getContractOrFail(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true,
      folio: true,
      tipoTitular: true,
      bienDescripcion: true,
      etapa: true,
      estatus: true,
      client: {
        select: {
          id: true,
          tipo: true,
          nombre: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          razonSocial: true,
          rfc: true,
        },
      },
    },
  });
  if (!contract) {
    throw new AppError('CONTRACT_NOT_FOUND', 'Contrato no encontrado', 404);
  }
  return contract;
}

/**
 * Carga un actor verificando existencia + obtiene tipoTitular del
 * contrato padre (necesario para resolver el catálogo correcto).
 */
async function getActorOrFail(actorId: string) {
  const actor = await prisma.expedienteActor.findUnique({
    where: { id: actorId },
    include: {
      contract: { select: { id: true, folio: true, tipoTitular: true } },
    },
  });
  if (!actor) {
    throw new AppError('ACTOR_NOT_FOUND', 'Actor del expediente no encontrado', 404);
  }
  return actor;
}

/**
 * Carga un documento + el actor padre + el contrato (necesario para
 * permisos por contrato y para borrar el archivo del disco).
 */
async function getDocumentoOrFail(docId: string) {
  const doc = await prisma.expedienteDocumento.findUnique({
    where: { id: docId },
    include: {
      actor: {
        include: {
          contract: { select: { id: true, folio: true, tipoTitular: true } },
        },
      },
    },
  });
  if (!doc) {
    throw new AppError('DOCUMENTO_NOT_FOUND', 'Documento no encontrado', 404);
  }
  return doc;
}

// ───────────────────────────────────────────────────────────────────
// Router
// ───────────────────────────────────────────────────────────────────

const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/contracts/:id/expediente
//
// Devuelve el expediente completo: contrato, todos los actores
// con sus catálogos resueltos y documentos cargados, y el cálculo
// de cobertura para el badge "Expediente X% completo".
// ─────────────────────────────────────────────────────────────
router.get(
  '/contracts/:id/expediente',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const contract = await getContractOrFail(req.params.id);

    const actores = await prisma.expedienteActor.findMany({
      where: { contractId: contract.id },
      orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
      include: {
        documentos: {
          orderBy: { fechaSubida: 'desc' },
          include: {
            subidoPorUser: {
              select: { id: true, nombre: true, apellidos: true, email: true },
            },
          },
        },
      },
    });

    const cobertura = calcularCobertura(
      contract.tipoTitular,
      actores.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        subtipo: a.subtipo,
        documentos: a.documentos.map((d) => ({
          tipoDocumento: d.tipoDocumento,
          tieneFisico: d.tieneFisico,
          tieneDigital: d.tieneDigital,
        })),
      })),
    );

    // Adjunta el catálogo + etiqueta a cada actor para que el
    // frontend no necesite re-resolver del lado cliente.
    // El catálogo se proyecta a {clave, etiqueta, opcional} —
    // shape estable consumido por ExpedienteTab y ChecklistExpedientePDF.
    const actoresConCatalogo = actores.map((a) => ({
      ...a,
      etiqueta: etiquetaActor(a.tipo, a.orden, a.subtipo),
      catalogo: catalogoParaActor(contract.tipoTitular, a.tipo, a.subtipo).map((c) => ({
        clave: c.tipo,
        etiqueta: c.etiqueta,
        opcional: c.opcional ?? false,
      })),
    }));

    res.json({
      contract,
      cobertura,
      actores: actoresConCatalogo,
    });
  }),
);

// ─────────────────────────────────────────────────────────────
// GET /api/contracts/:id/expediente/catalogos
//
// Devuelve los catálogos por tipo de actor sin tocar el estado
// del expediente. Útil para el modal "Agregar Aval" (el frontend
// muestra el catálogo PF vs PM antes de crear el actor).
// ─────────────────────────────────────────────────────────────
router.get(
  '/contracts/:id/expediente/catalogos',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const contract = await getContractOrFail(req.params.id);
    const tipoTitular = contract.tipoTitular;

    // Mismo mapper que el endpoint principal: {tipo,etiqueta,opcional?}
    // → {clave,etiqueta,opcional}. Mantiene consistencia para el frontend.
    const proj = (cat: ReturnType<typeof catalogoParaActor>) =>
      cat.map((c) => ({ clave: c.tipo, etiqueta: c.etiqueta, opcional: c.opcional ?? false }));

    res.json({
      tipoTitular,
      catalogos: {
        OPERACION:            proj(catalogoParaActor(tipoTitular, 'OPERACION')),
        SOLICITANTE:          proj(catalogoParaActor(tipoTitular, 'SOLICITANTE')),
        REPRESENTANTE_LEGAL:  proj(catalogoParaActor(tipoTitular, 'REPRESENTANTE_LEGAL')),
        PRINCIPAL_ACCIONISTA: proj(catalogoParaActor(tipoTitular, 'PRINCIPAL_ACCIONISTA')),
        AVAL_PF:              proj(catalogoParaActor(tipoTitular, 'AVAL', 'PF')),
        AVAL_PM:              proj(catalogoParaActor(tipoTitular, 'AVAL', 'PM')),
        BIEN_ARRENDADO:       proj(catalogoParaActor(tipoTitular, 'BIEN_ARRENDADO')),
        FORMALIZACION:        proj(catalogoParaActor(tipoTitular, 'FORMALIZACION')),
      },
    });
  }),
);

// ─────────────────────────────────────────────────────────────
// POST /api/contracts/:id/expediente/actores
//
// Crea un nuevo actor para el contrato. Casos típicos:
//   - Agregar AVAL (orden se autocalcula tomando el siguiente disponible)
//   - Re-crear un actor fijo borrado por error (se le asigna orden=1
//     y la unicidad de DB rechaza si ya existe → 409)
//
// Para AVAL, `subtipo` es OBLIGATORIO (PF o PM). El catálogo y la
// etiqueta dependen de ese subtipo.
// ─────────────────────────────────────────────────────────────
router.post(
  '/contracts/:id/expediente/actores',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const contract = await getContractOrFail(req.params.id);
    const data = createActorSchema.parse(req.body);

    if (data.tipo === 'AVAL' && !data.subtipo) {
      throw new AppError(
        'AVAL_SUBTIPO_REQUERIDO',
        'AVAL requiere subtipo (PF o PM)',
        400,
      );
    }

    // Para fijos: actores PM-only no pueden agregarse a un titular PFAE.
    if (
      contract.tipoTitular === 'PFAE' &&
      (data.tipo === 'REPRESENTANTE_LEGAL' || data.tipo === 'PRINCIPAL_ACCIONISTA')
    ) {
      throw new AppError(
        'ACTOR_INVALIDO_PARA_PFAE',
        `${data.tipo} solo aplica a contratos con titular PM`,
        400,
      );
    }

    // Calcular el siguiente `orden` disponible para este tipo.
    // Para fijos siempre intentará 1 (la unicidad lo rechaza si existe).
    // Para AVAL toma el max(orden)+1 → no chocará con avales previos.
    const ultimoOrden = await prisma.expedienteActor.findFirst({
      where: { contractId: contract.id, tipo: data.tipo },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });
    const orden = data.tipo === 'AVAL' ? (ultimoOrden?.orden ?? 0) + 1 : 1;

    try {
      const actor = await prisma.expedienteActor.create({
        data: {
          contractId: contract.id,
          tipo: data.tipo,
          subtipo: data.subtipo ?? null,
          orden,
          nombre: data.nombre ?? etiquetaActor(data.tipo, orden, data.subtipo),
          rfc: data.rfc ?? null,
          datosAdicionales:
            (data.datosAdicionales ?? null) as never, // Prisma JSON es estricto con `unknown`
        },
      });

      res.status(201).json({
        ...actor,
        etiqueta: etiquetaActor(actor.tipo, actor.orden, actor.subtipo),
        catalogo: catalogoParaActor(contract.tipoTitular, actor.tipo, actor.subtipo),
        documentos: [],
      });
    } catch (err: unknown) {
      // P2002 → ya existe un actor con (contractId, tipo, orden).
      // Esto solo debería pasar para fijos (orden=1).
      const code = (err as { code?: string } | null | undefined)?.code;
      if (code === 'P2002') {
        throw new AppError(
          'ACTOR_DUPLICADO',
          `Ya existe un actor ${data.tipo} en este contrato`,
          409,
        );
      }
      throw err;
    }
  }),
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/expediente/actores/:actorId
//
// Edita los campos del actor. Útil para:
//   - Personalizar el nombre (p.ej. "Rep. Legal: Juan Pérez García")
//   - Agregar RFC del aval
//   - Almacenar dirección/teléfono/% accionario en `datosAdicionales`
//
// `tipo`, `orden` y `contractId` son inmutables — para mover un actor
// se borra y se re-crea.
// ─────────────────────────────────────────────────────────────
router.patch(
  '/expediente/actores/:actorId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { actorId } = req.params;
    const data = updateActorSchema.parse(req.body);

    // Verificar que existe (para 404 explícito vs el P2025 de update)
    await getActorOrFail(actorId);

    const updated = await prisma.expedienteActor.update({
      where: { id: actorId },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.rfc !== undefined ? { rfc: data.rfc } : {}),
        ...(data.subtipo !== undefined ? { subtipo: data.subtipo } : {}),
        ...(data.datosAdicionales !== undefined
          ? { datosAdicionales: data.datosAdicionales as never }
          : {}),
      },
      include: {
        contract: { select: { tipoTitular: true } },
      },
    });

    res.json({
      ...updated,
      etiqueta: etiquetaActor(updated.tipo, updated.orden, updated.subtipo),
      catalogo: catalogoParaActor(
        updated.contract.tipoTitular,
        updated.tipo,
        updated.subtipo,
      ),
    });
  }),
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/expediente/actores/:actorId
//
// Borra un actor (cascade borra sus documentos, pero NO borra los
// archivos físicos del disco). Solo permitido para AVAL — los fijos
// representan secciones obligatorias del expediente y no se pueden
// quitar (el seeder los re-crearía igual).
//
// Restringido a ADMIN/DIRECTOR/LEGAL/OPERACIONES (no analistas).
// ─────────────────────────────────────────────────────────────
router.delete(
  '/expediente/actores/:actorId',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req: Request, res: Response) => {
    const { actorId } = req.params;
    const actor = await getActorOrFail(actorId);

    if (esActorFijo(actor.tipo)) {
      throw new AppError(
        'ACTOR_FIJO_NO_BORRABLE',
        `No se puede borrar el actor ${actor.tipo}; es parte fija del expediente`,
        400,
      );
    }

    // Cargar las URLs de archivos para borrarlos del disco después.
    const documentos = await prisma.expedienteDocumento.findMany({
      where: { actorId },
      select: { archivoUrl: true },
    });

    await prisma.expedienteActor.delete({ where: { id: actorId } });

    // Cleanup best-effort de archivos en disco.
    for (const d of documentos) {
      try {
        deleteIfExists(d.archivoUrl);
      } catch (err) {
        log.warn({ err, archivoUrl: d.archivoUrl }, 'Error borrando archivo huérfano');
      }
    }

    res.status(204).end();
  }),
);

// ─────────────────────────────────────────────────────────────
// POST /api/expediente/actores/:actorId/documentos
//
// Sube un archivo y crea el registro ExpedienteDocumento.
// Multipart form: `archivo` + metadatos opcionales en el body
// (tipoDocumento, tieneFisico, tieneDigital, estatus, notas).
//
// Defaults razonables: tieneDigital=true (lo acabas de subir),
// tieneFisico=false, estatus=PENDIENTE.
// ─────────────────────────────────────────────────────────────
router.post(
  '/expediente/actores/:actorId/documentos',
  requireAuth,
  uploadExpediente,
  asyncHandler(async (req: Request, res: Response) => {
    const { actorId } = req.params;

    if (!req.file) {
      throw new AppError('ARCHIVO_REQUERIDO', 'Se requiere el archivo', 400);
    }

    // Verifica que el actor exista ANTES de quedarnos con el archivo
    // huérfano. Multer ya lo escribió a disco; si el actor no existe
    // limpiamos para no acumular basura.
    const actor = await prisma.expedienteActor.findUnique({
      where: { id: actorId },
      select: { id: true },
    });
    if (!actor) {
      try {
        deleteIfExists(`/uploads/expedientes/${req.file.filename}`);
      } catch {
        /* ignore */
      }
      throw new AppError('ACTOR_NOT_FOUND', 'Actor del expediente no encontrado', 404);
    }

    const meta = uploadDocumentoSchema.parse(req.body);

    const doc = await prisma.expedienteDocumento.create({
      data: {
        actorId,
        tipoDocumento: meta.tipoDocumento ?? null,
        nombreArchivo: req.file.originalname,
        archivoUrl: publicUrl(req.file.filename, 'expedientes'),
        tieneFisico: meta.tieneFisico ?? false,
        tieneDigital: meta.tieneDigital ?? true,
        estatus: meta.estatus ?? 'PENDIENTE',
        notas: meta.notas ?? null,
        subidoPor: req.user!.userId,
      },
      include: {
        subidoPorUser: {
          select: { id: true, nombre: true, apellidos: true, email: true },
        },
      },
    });

    res.status(201).json(doc);
  }),
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/expediente/documentos/:docId
//
// Actualiza metadatos del documento sin re-subir el archivo. Casos:
//   - Marcar tieneFisico=true cuando llega el papel a oficina
//   - Cambiar estatus a VALIDADO o RECHAZADO (revisión legal)
//   - Asignar/cambiar tipoDocumento (clasificación tardía)
//   - Editar notas
// ─────────────────────────────────────────────────────────────
router.patch(
  '/expediente/documentos/:docId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { docId } = req.params;
    const data = updateDocumentoSchema.parse(req.body);

    await getDocumentoOrFail(docId);

    const updated = await prisma.expedienteDocumento.update({
      where: { id: docId },
      data: {
        ...(data.tipoDocumento !== undefined ? { tipoDocumento: data.tipoDocumento } : {}),
        ...(data.tieneFisico !== undefined ? { tieneFisico: data.tieneFisico } : {}),
        ...(data.tieneDigital !== undefined ? { tieneDigital: data.tieneDigital } : {}),
        ...(data.estatus !== undefined ? { estatus: data.estatus } : {}),
        ...(data.notas !== undefined ? { notas: data.notas } : {}),
      },
      include: {
        subidoPorUser: {
          select: { id: true, nombre: true, apellidos: true, email: true },
        },
      },
    });

    res.json(updated);
  }),
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/expediente/documentos/:docId
//
// Elimina el registro Y el archivo del disco. Operación destructiva
// — restringida a ADMIN/DIRECTOR/LEGAL/OPERACIONES. Para un "soft
// delete" (mantener historial), usar PATCH con estatus=RECHAZADO.
// ─────────────────────────────────────────────────────────────
router.delete(
  '/expediente/documentos/:docId',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR', 'LEGAL', 'OPERACIONES'),
  asyncHandler(async (req: Request, res: Response) => {
    const { docId } = req.params;
    const doc = await getDocumentoOrFail(docId);

    await prisma.expedienteDocumento.delete({ where: { id: docId } });

    try {
      deleteIfExists(doc.archivoUrl);
    } catch (err) {
      log.warn({ err, archivoUrl: doc.archivoUrl }, 'Error borrando archivo del documento');
    }

    res.status(204).end();
  }),
);

export default router;
