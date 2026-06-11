/**
 * routes/operationDrafts.ts
 * ──────────────────────────────────────────────────────────────────
 * Endpoints REST del flujo "borrador de operación" (Fase 1 del
 * prototipo mínimo definido el 20-05-2026 con Damián).
 *
 * El operador:
 *   1. Crea un draft vacío.
 *   2. Declara N actores (titular + avales por ahora).
 *   3. Sube documentos uno por uno (PDF / imagen).
 *   4. El sistema extrae datos con Claude, auto-asigna por CURP/RFC
 *      y mergea al actor consolidado.
 *   5. El operador puede reasignar / corregir / quitar docs.
 *   6. Cuando esté satisfecho → finaliza (no implementado en v0).
 *
 * Endpoints:
 *   POST   /api/operation-drafts                     crear draft
 *   GET    /api/operation-drafts                     listar drafts del usuario
 *   GET    /api/operation-drafts/:id                 estado completo
 *   PATCH  /api/operation-drafts/:id                 editar tipoOperacion
 *   DELETE /api/operation-drafts/:id                 soft-delete (status DISCARDED)
 *   POST   /api/operation-drafts/:id/actores         declarar actor
 *   PATCH  /api/operation-drafts/:id/actores/:aid    editar actor (datos / nombre)
 *   DELETE /api/operation-drafts/:id/actores/:aid    quitar actor
 *   POST   /api/operation-drafts/:id/documentos      subir doc (multer)
 *   PATCH  /api/operation-drafts/:id/documentos/:did reasignar actor / cambiar tipo
 *   DELETE /api/operation-drafts/:id/documentos/:did borrar doc
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { uploadDraft, publicUrl } from '../middleware/upload';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { childLogger } from '../lib/logger';
import {
  extractAndMergeDoc,
  esTipoDocSoportado,
} from '../services/operationDraft';
import {
  catalogoParaActor,
  esTipoDocEnCatalogo,
} from '../services/expedienteCatalogs';

const log = childLogger('operation-drafts');
const router = Router();

// ─────────────────────────────────────────────────────────────────
// Schemas de validación
// ─────────────────────────────────────────────────────────────────

const draftCreateSchema = z.object({
  tipoOperacion: z.enum(['PURO', 'FINANCIERO']).optional(),
});

const draftUpdateSchema = z.object({
  tipoOperacion: z.enum(['PURO', 'FINANCIERO']).nullable().optional(),
});

const actorCreateSchema = z.object({
  rol: z.enum(['TITULAR', 'AVAL', 'REPRESENTANTE_LEGAL', 'SOCIO']),
  // Subtipo: PFAE/PM para titular, PF/PM para avales y socios.
  subtipo: z.enum(['PFAE', 'PM', 'PF']),
  nombre: z.string().min(1).max(200),
});

/**
 * Schema canónico de `datosConsolidados` para un actor del draft.
 *
 * Espeja los campos que `services/operationDraft.ts → camposPorTipoDoc`
 * escribe automáticamente al mergear extracciones, MÁS los campos
 * que el operador puede editar manualmente. Todos opcionales — un
 * actor puede vivir con la mitad de los datos hasta que se finalice.
 *
 * Tipado estricto en string/number/boolean para los conocidos, y
 * `.passthrough()` para forward-compat: la UI puede mandar notas /
 * flags propios sin que el server los rechace. Esto evita el
 * problema de aceptar cualquier shape (`z.record(z.unknown())` →
 * inyección arbitraria) sin acoplarse a un catálogo fijo que
 * obligue migraciones cada vez que crezca.
 */
const datosConsolidadosSchema = z
  .object({
    // Identidad personal (INE + CSF + manual)
    nombre: z.string().max(200).nullable().optional(),
    apellidoPaterno: z.string().max(200).nullable().optional(),
    apellidoMaterno: z.string().max(200).nullable().optional(),
    razonSocial: z.string().max(400).nullable().optional(),
    rfc: z.string().max(20).nullable().optional(),
    curp: z.string().max(20).nullable().optional(),
    fechaNacimiento: z.string().max(20).nullable().optional(),
    lugarNacimiento: z.string().max(200).nullable().optional(),
    nacionalidad: z.string().max(100).nullable().optional(),
    sexo: z.string().max(10).nullable().optional(),
    // Identidad fiscal
    regimenFiscal: z.string().max(200).nullable().optional(),
    fiel: z.string().max(50).nullable().optional(),
    // Datos bancarios (extraídos del estado de cuenta o manuales)
    banco: z.string().max(100).nullable().optional(),
    clabe: z.string().max(20).nullable().optional(),
    numeroCuenta: z.string().max(30).nullable().optional(),
    // Domicilio (mismos campos para fiscal y particular en v0)
    calle: z.string().max(200).nullable().optional(),
    numExterior: z.string().max(20).nullable().optional(),
    numInterior: z.string().max(20).nullable().optional(),
    colonia: z.string().max(200).nullable().optional(),
    municipio: z.string().max(200).nullable().optional(),
    ciudad: z.string().max(200).nullable().optional(),
    estado: z.string().max(100).nullable().optional(),
    codigoPostal: z.string().max(10).nullable().optional(),
    cp: z.string().max(10).nullable().optional(),
    pais: z.string().max(100).nullable().optional(),
    // Contacto
    email: z.string().max(200).nullable().optional(),
    telefono: z.string().max(40).nullable().optional(),
    celular: z.string().max(40).nullable().optional(),
    // Estado civil / cónyuge
    estadoCivil: z.string().max(40).nullable().optional(),
    regimenMatrimonial: z.string().max(40).nullable().optional(),
    nombreConyuge: z.string().max(400).nullable().optional(),
    // PM corporativo
    fechaConstitucion: z.string().max(20).nullable().optional(),
    capitalSocial: z.number().nullable().optional(),
    folioMercantil: z.string().max(100).nullable().optional(),
    // Otros (notas libres del operador, ingresos, etc.)
    ingresoMensual: z.number().nullable().optional(),
    ocupacion: z.string().max(200).nullable().optional(),
    notas: z.string().max(2000).nullable().optional(),
  })
  // passthrough deja pasar llaves desconocidas con valores primitivos
  // (UI puede agregar flags o metadata) pero el schema rechaza tipos
  // raros como Function/Symbol/objetos anidados arbitrarios.
  .passthrough();

const actorUpdateSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  subtipo: z.enum(['PFAE', 'PM', 'PF']).optional(),
  datosConsolidados: datosConsolidadosSchema.optional(),
});

const documentoCreateBodySchema = z.object({
  tipoDocumento: z.string().min(1).max(50),
  // Opcional: si el operador ya sabe a qué actor pertenece, lo declara.
  // Si no, queda null y el sistema intenta auto-match tras la extracción.
  actorId: z.string().cuid().nullable().optional(),
});

const documentoUpdateSchema = z.object({
  actorId: z.string().cuid().nullable().optional(),
  tipoDocumento: z.string().min(1).max(50).optional(),
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Autorización: el creador del draft + ADMIN + DIRECTOR pueden acceder.
 * Roles operativos no creadores se bloquean con 403. ADMIN/DIRECTOR
 * pueden auxiliar al operador (caso real: el operador llama a soporte
 * porque el auto-match falló).
 */
async function getDraftOrFail(id: string, userId: string, rol: string) {
  const draft = await prisma.operationDraft.findUnique({ where: { id } });
  if (!draft) throw new AppError('DRAFT_NOT_FOUND', 'Borrador no encontrado', 404);
  const esCreador = draft.createdById === userId;
  const esGerencia = rol === 'ADMIN' || rol === 'DIRECTOR';
  if (!esCreador && !esGerencia) {
    throw new AppError('DRAFT_FORBIDDEN', 'No tienes acceso a este borrador', 403);
  }
  if (draft.status === 'DISCARDED') {
    throw new AppError('DRAFT_DISCARDED', 'Este borrador fue descartado', 410);
  }
  return draft;
}

async function getActorOrFail(actorId: string, draftId: string) {
  const actor = await prisma.operationDraftActor.findUnique({ where: { id: actorId } });
  if (!actor || actor.draftId !== draftId) {
    throw new AppError('ACTOR_NOT_FOUND', 'Actor no encontrado en el borrador', 404);
  }
  return actor;
}

async function getDocumentoOrFail(docId: string, draftId: string) {
  const doc = await prisma.operationDraftDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.draftId !== draftId) {
    throw new AppError('DOC_NOT_FOUND', 'Documento no encontrado en el borrador', 404);
  }
  return doc;
}

// ─────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────

// POST /api/operation-drafts — crear draft vacío
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const data = draftCreateSchema.parse(req.body);
    const userId = req.user!.userId;

    const draft = await prisma.operationDraft.create({
      data: {
        createdById: userId,
        tipoOperacion: data.tipoOperacion ?? null,
      },
    });

    log.info({ draftId: draft.id, userId }, 'borrador creado');
    res.status(201).json(draft);
  }),
);

// GET /api/operation-drafts — listar drafts del usuario en DRAFT status
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const drafts = await prisma.operationDraft.findMany({
      where: { createdById: userId, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { actores: true } },
      },
    });
    res.json(drafts);
  }),
);

// GET /api/operation-drafts/catalogo — catálogo de tipos de documento
//
// Devuelve el catálogo del expediente proyectado por sección, para que
// el dropdown del flujo borrador ("Tipo del próximo upload") se llene
// desde el server en vez de tener tipos hardcodeados. El cliente filtra
// la sección de la persona según el involucrado seleccionado y siempre
// ofrece las secciones compartidas (OPERACIÓN, BIEN_ARRENDADO,
// FORMALIZACIÓN) que incluyen los documentos que la operación genera.
//
// NO requiere :id ni toca un draft — es estático. Debe declararse ANTES
// de GET /:id para que Express no lo capture como un id.
router.get(
  '/catalogo',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const proj = (cat: ReturnType<typeof catalogoParaActor>) =>
      cat.map((c) => ({ clave: c.tipo, etiqueta: c.etiqueta, opcional: c.opcional ?? false }));

    res.json({
      catalogos: {
        OPERACION_PFAE:       proj(catalogoParaActor('PFAE', 'OPERACION')),
        OPERACION_PM:         proj(catalogoParaActor('PM', 'OPERACION')),
        SOLICITANTE_PFAE:     proj(catalogoParaActor('PFAE', 'SOLICITANTE')),
        SOLICITANTE_PM:       proj(catalogoParaActor('PM', 'SOLICITANTE')),
        REPRESENTANTE_LEGAL:  proj(catalogoParaActor('PM', 'REPRESENTANTE_LEGAL')),
        PRINCIPAL_ACCIONISTA: proj(catalogoParaActor('PM', 'PRINCIPAL_ACCIONISTA')),
        AVAL_PF:              proj(catalogoParaActor('PFAE', 'AVAL', 'PF')),
        AVAL_PM:              proj(catalogoParaActor('PFAE', 'AVAL', 'PM')),
        BIEN_ARRENDADO:       proj(catalogoParaActor('PFAE', 'BIEN_ARRENDADO')),
        FORMALIZACION:        proj(catalogoParaActor('PFAE', 'FORMALIZACION')),
      },
    });
  }),
);

// GET /api/operation-drafts/:id — estado completo (actores + docs)
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);

    const actores = await prisma.operationDraftActor.findMany({
      where: { draftId: draft.id },
      orderBy: [{ rol: 'asc' }, { orden: 'asc' }],
      include: {
        documentos: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Docs sin asignar (actorId=null) — la UI los muestra en una zona
    // separada con un dropdown para asignar.
    const docsHuerfanos = await prisma.operationDraftDocument.findMany({
      where: { draftId: draft.id, actorId: null },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ...draft,
      actores,
      docsSinAsignar: docsHuerfanos,
    });
  }),
);

// PATCH /api/operation-drafts/:id — editar tipoOperacion
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    const data = draftUpdateSchema.parse(req.body);

    const updated = await prisma.operationDraft.update({
      where: { id: draft.id },
      data: { tipoOperacion: data.tipoOperacion ?? null },
    });
    res.json(updated);
  }),
);

// DELETE /api/operation-drafts/:id — soft delete (DISCARDED)
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    await prisma.operationDraft.update({
      where: { id: draft.id },
      data: { status: 'DISCARDED' },
    });
    log.info({ draftId: draft.id, userId: req.user!.userId }, 'borrador descartado');
    res.status(204).send();
  }),
);

// ─────────────────────────────────────────────────────────────────
// Actores
// ─────────────────────────────────────────────────────────────────

// POST /api/operation-drafts/:id/actores — declarar nuevo actor
router.post(
  '/:id/actores',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    const data = actorCreateSchema.parse(req.body);

    // TITULAR es único por draft — rechaza segundo intento.
    if (data.rol === 'TITULAR') {
      const existeTitular = await prisma.operationDraftActor.findFirst({
        where: { draftId: draft.id, rol: 'TITULAR' },
      });
      if (existeTitular) {
        throw new AppError('TITULAR_DUPLICADO', 'El borrador ya tiene un titular', 409);
      }
    }

    // Validación cruzada rol × subtipo. TITULAR solo acepta PFAE o PM
    // (un titular nunca puede ser PF). AVAL acepta los tres.
    if (data.rol === 'TITULAR' && data.subtipo === 'PF') {
      throw new AppError(
        'TITULAR_PF_INVALIDO',
        'El titular debe ser PFAE o PM, no PF',
        400,
      );
    }
    // REPRESENTANTE_LEGAL y SOCIO son siempre personas físicas (PF).
    if ((data.rol === 'REPRESENTANTE_LEGAL' || data.rol === 'SOCIO') && data.subtipo !== 'PF') {
      throw new AppError(
        'SUBTIPO_INVALIDO_PARA_ROL',
        `${data.rol} debe ser persona física (PF)`,
        400,
      );
    }

    // Orden: siguiente disponible para el rol.
    const ultimo = await prisma.operationDraftActor.findFirst({
      where: { draftId: draft.id, rol: data.rol },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });
    const orden = (ultimo?.orden ?? 0) + 1;

    const actor = await prisma.operationDraftActor.create({
      data: {
        draftId: draft.id,
        rol: data.rol,
        subtipo: data.subtipo,
        nombre: data.nombre,
        orden,
      },
    });

    res.status(201).json(actor);
  }),
);

// PATCH /api/operation-drafts/:id/actores/:aid — editar
router.patch(
  '/:id/actores/:aid',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    await getActorOrFail(req.params.aid, draft.id);
    const data = actorUpdateSchema.parse(req.body);

    const updated = await prisma.operationDraftActor.update({
      where: { id: req.params.aid },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.subtipo !== undefined ? { subtipo: data.subtipo } : {}),
        ...(data.datosConsolidados !== undefined
          ? { datosConsolidados: data.datosConsolidados as never }
          : {}),
      },
    });
    res.json(updated);
  }),
);

// DELETE /api/operation-drafts/:id/actores/:aid — quitar
// Si tiene docs asignados, quedan huérfanos (actorId=null) — el
// operador los reasigna o los borra.
router.delete(
  '/:id/actores/:aid',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    await getActorOrFail(req.params.aid, draft.id);

    await prisma.operationDraftActor.delete({
      where: { id: req.params.aid },
    });
    res.status(204).send();
  }),
);

// ─────────────────────────────────────────────────────────────────
// Documentos
// ─────────────────────────────────────────────────────────────────

// POST /api/operation-drafts/:id/documentos — subir + extraer en background
//
// El upload se valida con multer (10MB, PDF + imágenes). Tras
// persistir el row, lanzamos `extractAndMergeDoc(docId)` en
// fire-and-forget — el endpoint responde inmediato con el doc
// recién creado, y la UI hace polling sobre /api/operation-drafts/:id
// para ver cuando `extraidoEn` se popule.
router.post(
  '/:id/documentos',
  requireAuth,
  uploadDraft,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    const data = documentoCreateBodySchema.parse(req.body);

    if (!req.file) {
      throw new AppError('FILE_REQUIRED', 'Debes adjuntar un archivo en el campo "archivo"', 400);
    }

    // El tipo debe pertenecer al catálogo del expediente, o ser 'OTRO'
    // (escape hatch para docs fuera de catálogo). La AUTO-EXTRACCIÓN
    // aplica a los tipos con extractor (esTipoDocSoportado, ver
    // EXTRACT_POR_TIPO_DOC); los demás se guardan sin extraer.
    if (!esTipoDocEnCatalogo(data.tipoDocumento) && data.tipoDocumento !== 'OTRO') {
      throw new AppError(
        'TIPO_DOC_NO_SOPORTADO',
        `Tipo de documento desconocido: ${data.tipoDocumento}. Debe pertenecer al catálogo del expediente o ser "OTRO".`,
        400,
      );
    }

    if (data.actorId) {
      await getActorOrFail(data.actorId, draft.id);
    }

    // archivoPath se guarda como URL pública (/uploads/drafts/<filename>)
    // en vez del path absoluto del filesystem. Esto desacopla la BD del
    // layout del disco: si mañana montas uploads en /mnt/efs/uploads en
    // lugar de server/uploads/, los drafts existentes siguen apuntando
    // a la URL correcta. El servicio resuelve al path absoluto al leer.
    //
    // Si el cifrado S6 está activo, req.file.filename ya viene con
    // sufijo .enc; `publicUrl` lo strip-ea para mantener URLs estables.
    const doc = await prisma.operationDraftDocument.create({
      data: {
        draftId: draft.id,
        actorId: data.actorId ?? null,
        tipoDocumento: data.tipoDocumento,
        nombreArchivo: req.file.originalname,
        archivoPath: publicUrl(req.file.filename, 'drafts'),
      },
    });

    // Extracción síncrona para tipos soportados. Bloquea el response
    // pero garantiza que el doc devuelto al cliente ya tenga la
    // extracción + auto-match aplicados. Si el extract está caído o
    // tarda mucho, esto puede ser lento — en v0.1 lo movemos a una
    // cola (BullMQ / Redis) y el frontend hace polling.
    //
    // Nota: probamos primero con fire-and-forget pero express cerraba
    // la stack antes de que la promesa corriera, dejando el doc sin
    // extraer. El sync es más simple y predecible para el prototipo.
    if (esTipoDocSoportado(doc.tipoDocumento)) {
      try {
        await extractAndMergeDoc(doc.id);
      } catch (err) {
        log.error({ err, docId: doc.id }, 'extracción falló (se devuelve doc sin extracción)');
      }
    }

    // Releer para devolver el estado post-extracción (la extracción
    // pudo haber poblado actorId vía auto-match, extraccion, etc.).
    const docFinal = await prisma.operationDraftDocument.findUnique({
      where: { id: doc.id },
    });
    res.status(201).json(docFinal ?? doc);
  }),
);

// PATCH /api/operation-drafts/:id/documentos/:did — reasignar / cambiar tipo
router.patch(
  '/:id/documentos/:did',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    await getDocumentoOrFail(req.params.did, draft.id);
    const data = documentoUpdateSchema.parse(req.body);

    if (data.actorId) {
      await getActorOrFail(data.actorId, draft.id);
    }

    const updated = await prisma.operationDraftDocument.update({
      where: { id: req.params.did },
      data: {
        ...(data.actorId !== undefined ? { actorId: data.actorId, autoAsignado: false } : {}),
        ...(data.tipoDocumento !== undefined ? { tipoDocumento: data.tipoDocumento } : {}),
      },
    });

    // Si el operador cambió el actor, re-ejecutamos merge con la
    // extracción cacheada (no llamamos al provider de nuevo).
    if (data.actorId !== undefined && updated.actorId && updated.extraccion) {
      // El merge solo aplica para tipos soportados.
      if (esTipoDocSoportado(updated.tipoDocumento)) {
        extractAndMergeDoc(updated.id).catch((err) => {
          log.error({ err, docId: updated.id }, 're-merge tras reassign falló');
        });
      }
    }

    res.json(updated);
  }),
);

// DELETE /api/operation-drafts/:id/documentos/:did — quitar doc
// NOTA: no borramos el archivo de disco en v0 — fácil de añadir
// después con deleteIfExists del middleware/upload.
router.delete(
  '/:id/documentos/:did',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const draft = await getDraftOrFail(req.params.id, req.user!.userId, req.user!.rol);
    await getDocumentoOrFail(req.params.did, draft.id);

    await prisma.operationDraftDocument.delete({
      where: { id: req.params.did },
    });
    res.status(204).send();
  }),
);

export default router;
