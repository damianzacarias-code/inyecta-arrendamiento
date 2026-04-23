import { Router, Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { notificar } from '../lib/notificar';
import { childLogger } from '../lib/logger';
import {
  contractKycFieldsObject,
  contractKycRefine,
  declaracionPEPSchema,
  perfilTransaccionalSchema,
  proveedorSchema,
} from '../schemas/contract';
import { sembrarActoresIniciales } from '../services/expedienteSeeder';

const log = childLogger('contracts');

const router = Router();

/** Devuelve un nombre legible del cliente: razón social (PM) o "nombre apellido" (PF). */
function nombreCliente(c: { tipo: string; nombre?: string | null; apellidoPaterno?: string | null; razonSocial?: string | null } | null | undefined): string {
  if (!c) return 'cliente';
  if (c.tipo === 'PM') return c.razonSocial || 'cliente';
  return `${c.nombre || ''} ${c.apellidoPaterno || ''}`.trim() || 'cliente';
}

/** Formatea un monto como moneda MXN sin depender de Intl en el server.
 *  Acepta number, string o Decimal de Prisma (cualquier cosa con toString numérico). */
function fmt$(n: number | string | { toString(): string }): string {
  const num = typeof n === 'number' ? n : Number(n.toString());
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STAGE_ORDER = ['SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO'];

const STAGE_LABELS: Record<string, string> = {
  SOLICITUD: 'Solicitud',
  ANALISIS_CLIENTE: 'Analisis Cliente',
  ANALISIS_BIEN: 'Analisis Bien',
  COMITE: 'Comite',
  FORMALIZACION: 'Formalizacion',
  DESEMBOLSO: 'Desembolso',
  ACTIVO: 'Activo',
};

// ── Campos base del contrato (financieros + datos del bien) ──────
//
// Los campos KYC adicionales (proveedor, perfil transaccional, PEP,
// obligados solidarios, datos de solicitud y terceros) vienen de
// `contractKycFieldsObject` y se fusionan abajo. El modelo `Proveedor`
// 1:1 reemplaza al string legacy `Contract.proveedor`.
const createContractBaseSchema = z.object({
  clientId: z.string(),
  quotationId: z.string().optional(),
  categoriaId: z.string().optional(),
  bienDescripcion: z.string().min(1),
  bienMarca: z.string().optional(),
  bienModelo: z.string().optional(),
  bienAnio: z.number().optional(),
  bienNumSerie: z.string().optional(),
  bienEstado: z.string().optional(),
  /** Legacy string — si se envía, se copia a Contract.proveedor por
   *  compatibilidad. El wizard nuevo envía `proveedor` como objeto
   *  anidado (ver contractKycFieldsObject). */
  proveedorLegacy: z.string().optional(),
  producto: z.enum(['PURO', 'FINANCIERO']),
  valorBien: z.number().min(150000),
  plazo: z.number().min(12).max(48),
  tasaAnual: z.number().default(0.36),
  nivelRiesgo: z.enum(['A', 'B', 'C']).default('A'),
  enganche: z.number().default(0),
  depositoGarantia: z.number().default(0),
  comisionApertura: z.number().default(0),
  rentaInicial: z.number().default(0),
  gpsInstalacion: z.number().default(0),
  seguroAnual: z.number().default(0),
  valorResidual: z.number().default(0),
  montoFinanciar: z.number(),
  rentaMensual: z.number(),
  rentaMensualIVA: z.number(),
});

// Schema compuesto: campos base del contrato + bloque KYC + reglas
// condicionales del bloque KYC (terceros, unicidad de aval, PEP).
const createContractSchema = createContractBaseSchema
  .merge(contractKycFieldsObject)
  .superRefine(contractKycRefine);

// POST /api/contracts - Crear contrato
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createContractSchema.parse(req.body);
    const userId = req.user!.userId;

    // El tipoTitular se deriva del cliente (PFAE | PM) y se persiste
    // en el contrato — ya no se infiere por joins porque el contrato
    // tiene su propio expediente independiente.
    const cliente = await prisma.client.findUnique({
      where: { id: data.clientId },
      select: { id: true, tipo: true },
    });
    if (!cliente) {
      return res.status(400).json({ error: 'Cliente no encontrado' });
    }

    // Generar folio
    const year = new Date().getFullYear();
    const count = await prisma.contract.count();
    const folio = `ARR-${String(count + 1).padStart(3, '0')}-${year}`;

    const valorBienIVA = data.valorBien * 1.16;

    // Si viene desde una cotización, validar que no esté ya convertida
    let cotizacionFolio: string | null = null;
    if (data.quotationId) {
      const cotizacion = await prisma.quotation.findUnique({
        where: { id: data.quotationId },
        include: { contrato: { select: { id: true, folio: true } } },
      });
      if (!cotizacion) return res.status(400).json({ error: 'Cotización no encontrada' });
      if (cotizacion.contrato) {
        return res.status(400).json({
          error: `La cotización ya generó el contrato ${cotizacion.contrato.folio}`,
          contratoId: cotizacion.contrato.id,
        });
      }
      if (cotizacion.estado === 'RECHAZADA' || cotizacion.estado === 'VENCIDA') {
        return res.status(400).json({
          error: `No se puede crear contrato desde una cotización ${cotizacion.estado.toLowerCase()}`,
        });
      }
      cotizacionFolio = cotizacion.folio;
    }

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          folio,
          clientId: data.clientId,
          tipoTitular: cliente.tipo,
          quotationId: data.quotationId || null,
          userId,
          categoriaId: data.categoriaId || null,
          bienDescripcion: data.bienDescripcion,
          bienMarca: data.bienMarca,
          bienModelo: data.bienModelo,
          bienAnio: data.bienAnio,
          bienNumSerie: data.bienNumSerie,
          bienEstado: data.bienEstado,
          proveedor: data.proveedorLegacy, // legacy string column
          producto: data.producto,
          valorBien: data.valorBien,
          valorBienIVA,
          plazo: data.plazo,
          tasaAnual: data.tasaAnual,
          nivelRiesgo: data.nivelRiesgo,
          enganche: data.enganche,
          depositoGarantia: data.depositoGarantia,
          comisionApertura: data.comisionApertura,
          rentaInicial: data.rentaInicial,
          gpsInstalacion: data.gpsInstalacion,
          seguroAnual: data.seguroAnual,
          valorResidual: data.valorResidual,
          montoFinanciar: data.montoFinanciar,
          rentaMensual: data.rentaMensual,
          rentaMensualIVA: data.rentaMensualIVA,
          // ── Datos de la solicitud CNBV ────────────────────────
          lugarSolicitud: data.lugarSolicitud,
          fechaSolicitud: data.fechaSolicitud,
          promotor: data.promotor,
          montoSolicitado: data.montoSolicitado,
          destinoArrendamiento: data.destinoArrendamiento,
          tercerBeneficiarioExiste: data.tercerBeneficiarioExiste,
          tercerBeneficiarioInfo: data.tercerBeneficiarioInfo,
          tercerAportanteExiste: data.tercerAportanteExiste,
          tercerAportanteInfo: data.tercerAportanteInfo,
          etapa: 'SOLICITUD',
          stageHistory: {
            create: {
              etapa: 'SOLICITUD',
              observacion: cotizacionFolio
                ? `Contrato creado desde cotización ${cotizacionFolio}`
                : 'Contrato creado',
              usuarioId: userId,
            },
          },
        },
        include: {
          client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true } },
          user: { select: { nombre: true, apellidos: true } },
          stageHistory: { orderBy: { fecha: 'desc' } },
        },
      });

      // ── Bloques KYC anidados (opcionales) ───────────────────
      if (data.proveedor) {
        await tx.proveedor.create({
          data: { ...data.proveedor, contractId: created.id } as any,
        });
      }
      if (data.perfilTransaccional) {
        await tx.perfilTransaccional.create({
          data: {
            ...data.perfilTransaccional,
            contractId: created.id,
          } as any,
        });
      }
      if (data.declaracionesPEP && data.declaracionesPEP.length > 0) {
        await tx.declaracionPEP.createMany({
          data: data.declaracionesPEP.map((d) => ({
            ...d,
            contractId: created.id,
          })) as any,
        });
      }
      // Sembrar actores fijos del expediente (OPERACION, SOLICITANTE,
      // FORMALIZACION, BIEN_ARRENDADO; +REP_LEGAL/PRINCIPAL_ACCIONISTA
      // si tipoTitular=PM). Los AVALes se agregan después manualmente
      // desde la UI vía /api/expediente/actores. Idempotente.
      await sembrarActoresIniciales(tx, created.id, cliente.tipo);

      if (data.quotationId) {
        await tx.quotation.update({
          where: { id: data.quotationId },
          data: { estado: 'CONVERTIDA' },
        });
      }

      return created;
    });

    // Notificación: SOLICITUD_CREADA → ADMIN + LEGAL + ejecutivo
    notificar({
      tipo: 'SOLICITUD_CREADA',
      titulo: `Nueva solicitud ${contract.folio}`,
      mensaje: `${contract.bienDescripcion} por ${fmt$(contract.montoFinanciar)} — cliente ${nombreCliente(contract.client)}`,
      entidad: 'Contract',
      entidadId: contract.id,
      url: `/contratos/${contract.id}`,
      ejecutivoId: userId,
    });

    return res.status(201).json(contract);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Create contract error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contracts - Listar contratos (pipeline view)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { etapa, estatus, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (etapa) where.etapa = etapa;
    if (estatus) where.estatus = estatus;

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true } },
          user: { select: { nombre: true, apellidos: true } },
        },
      }),
      prisma.contract.count({ where }),
    ]);

    // Pipeline counts
    const stageCounts = await prisma.contract.groupBy({
      by: ['etapa'],
      where: { estatus: 'EN_PROCESO' },
      _count: true,
    });

    const pipeline = STAGE_ORDER.map(stage => ({
      stage,
      label: STAGE_LABELS[stage],
      count: stageCounts.find(s => s.etapa === stage)?._count || 0,
    }));

    return res.json({
      data: contracts,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      pipeline,
    });
  } catch (error) {
    log.error({ err: error }, 'List contracts error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contracts/:id - Detalle contrato
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        user: { select: { nombre: true, apellidos: true, email: true } },
        categoria: { select: { nombre: true, requiereGPS: true } },
        stageHistory: { orderBy: { fecha: 'desc' } },
        // Bloques KYC CNBV
        proveedorData: true,
        perfilTransaccional: true,
        declaracionesPEP: true,
        // Expediente por actor (operación, solicitante, avales, etc.)
        // Solo metadatos básicos aquí — el detalle completo (catálogos +
        // documentos) se consulta vía GET /api/contracts/:id/expediente.
        actores: {
          orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
          select: {
            id: true,
            tipo: true,
            subtipo: true,
            orden: true,
            nombre: true,
            rfc: true,
          },
        },
        notas: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { user: { select: { nombre: true, apellidos: true } } },
        },
      },
    });

    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
    return res.json(contract);
  } catch (error) {
    log.error({ err: error }, 'Get contract error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contracts/:id/advance - Avanzar etapa
router.put('/:id/advance', requireAuth, async (req: Request, res: Response) => {
  try {
    const { observacion, comiteResolucion } = req.body;
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const currentIdx = STAGE_ORDER.indexOf(contract.etapa);
    if (currentIdx >= STAGE_ORDER.length - 1) {
      return res.status(400).json({ error: 'El contrato ya esta en la ultima etapa' });
    }

    // Comite check
    if (contract.etapa === 'COMITE' && !comiteResolucion) {
      return res.status(400).json({ error: 'Se requiere resolucion del comite (APROBADO, APROBADO_CONDICIONES, RECHAZADO)' });
    }

    if (contract.etapa === 'COMITE' && comiteResolucion === 'RECHAZADO') {
      // Rechazado en comite
      const updated = await prisma.contract.update({
        where: { id: req.params.id },
        data: {
          comiteResolucion,
          estatus: 'RESCINDIDO',
          motivoTerminacion: observacion || 'Rechazado en comite',
          stageHistory: {
            create: { etapa: contract.etapa, observacion: `Comite: ${comiteResolucion}. ${observacion || ''}`, usuarioId: req.user!.userId },
          },
        },
        include: {
          client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
          stageHistory: { orderBy: { fecha: 'desc' } },
        },
      });
      // Notificación: rechazo en comité → ADMIN + ejecutivo
      notificar({
        tipo: 'CONTRATO_RESCINDIDO',
        titulo: `Comité rechazó ${updated.folio}`,
        mensaje: `Cliente ${nombreCliente(updated.client)}. ${observacion || ''}`.trim(),
        entidad: 'Contract',
        entidadId: updated.id,
        url: `/contratos/${updated.id}`,
        ejecutivoId: updated.userId,
      });
      return res.json(updated);
    }

    const nextStage = STAGE_ORDER[currentIdx + 1];

    const updateData: any = {
      etapa: nextStage,
      etapaFecha: new Date(),
      stageHistory: {
        create: { etapa: nextStage, observacion: observacion || `Avanzado a ${STAGE_LABELS[nextStage]}`, usuarioId: req.user!.userId },
      },
    };

    if (comiteResolucion) updateData.comiteResolucion = comiteResolucion;
    if (nextStage === 'ACTIVO') {
      updateData.estatus = 'VIGENTE';
      updateData.fechaInicio = new Date();
      // Generate amortization table
      const fechaInicio = new Date();
      const tasaMensual = Number(contract.tasaAnual) / 12;
      const monto = Number(contract.montoFinanciar);
      const plazoMeses = contract.plazo;
      const seguroMensual = Number(contract.seguroAnual) / 12;
      const isPuro = contract.producto === 'PURO';

      // PMT
      let rentaBase: number;
      if (tasaMensual === 0) {
        rentaBase = monto / plazoMeses;
      } else {
        rentaBase = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) / (Math.pow(1 + tasaMensual, plazoMeses) - 1);
      }

      const amortEntries = [];
      let saldo = monto;
      for (let i = 1; i <= plazoMeses; i++) {
        const fechaPago = new Date(fechaInicio);
        fechaPago.setMonth(fechaPago.getMonth() + i);
        const interes = saldo * tasaMensual;
        const capital = isPuro ? 0 : rentaBase - interes;
        const renta = isPuro ? rentaBase : rentaBase;
        const iva = renta * 0.16;
        const pagoTotal = renta + iva + seguroMensual;
        const saldoFinal = isPuro ? saldo : Math.max(0, saldo - capital);

        amortEntries.push({
          periodo: i,
          fechaPago,
          saldoInicial: Math.round(saldo * 100) / 100,
          intereses: Math.round(interes * 100) / 100,
          pagoCapital: Math.round(capital * 100) / 100,
          renta: Math.round(renta * 100) / 100,
          iva: Math.round(iva * 100) / 100,
          seguro: Math.round(seguroMensual * 100) / 100,
          pagoTotal: Math.round(pagoTotal * 100) / 100,
          saldoFinal: Math.round(saldoFinal * 100) / 100,
        });
        saldo = saldoFinal;
      }

      updateData.amortizacion = { createMany: { data: amortEntries } };
      updateData.fechaVencimiento = amortEntries[amortEntries.length - 1].fechaPago;
    }

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        client: { select: { id: true, tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true } },
        stageHistory: { orderBy: { fecha: 'desc' } },
      },
    });

    // Notificación: etapa avanzada (con caso especial cuando llega a ACTIVO)
    if (nextStage === 'ACTIVO') {
      notificar({
        tipo: 'CONTRATO_ACTIVADO',
        titulo: `Contrato ${updated.folio} activado`,
        mensaje: `${nombreCliente(updated.client)} — vigente, primera renta ${updateData.fechaVencimiento ? '' : ''}`,
        entidad: 'Contract',
        entidadId: updated.id,
        url: `/contratos/${updated.id}`,
        ejecutivoId: updated.userId,
      });
    } else {
      notificar({
        tipo: 'ETAPA_AVANZADA',
        titulo: `${updated.folio} → ${STAGE_LABELS[nextStage]}`,
        mensaje: `Cliente ${nombreCliente(updated.client)}. ${observacion || ''}`.trim(),
        entidad: 'Contract',
        entidadId: updated.id,
        url: `/contratos/${updated.id}`,
        ejecutivoId: updated.userId,
      });
    }

    return res.json(updated);
  } catch (error) {
    log.error({ err: error }, 'Advance contract error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contracts/:id/notes - Agregar nota
router.post('/:id/notes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contenido } = req.body;
    if (!contenido?.trim()) return res.status(400).json({ error: 'Contenido requerido' });

    const note = await prisma.note.create({
      data: {
        contractId: req.params.id,
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

// ═════════════════════════════════════════════════════════════════
// ENDPOINTS KYC / SOLICITUD CNBV — editan bloques anidados del
// contrato después de creación (útil cuando el wizard guarda en
// borradores o para correcciones posteriores a la solicitud).
// ═════════════════════════════════════════════════════════════════

// PUT /api/contracts/:id/proveedor — upsert del proveedor (1:1)
router.put('/:id/proveedor', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const data = proveedorSchema.parse(req.body);
    const proveedor = await prisma.proveedor.upsert({
      where: { contractId: req.params.id },
      update: data as any,
      create: { ...data, contractId: req.params.id } as any,
    });
    return res.json(proveedor);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Upsert proveedor error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contracts/:id/perfil-transaccional — upsert (1:1)
router.put('/:id/perfil-transaccional', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const data = perfilTransaccionalSchema.parse(req.body);
    const perfil = await prisma.perfilTransaccional.upsert({
      where: { contractId: req.params.id },
      update: data as any,
      create: { ...data, contractId: req.params.id } as any,
    });
    return res.json(perfil);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Upsert perfil error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contracts/:id/declaraciones-pep — upsert por tipo (1:n)
router.put('/:id/declaraciones-pep', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const data = z.array(declaracionPEPSchema).parse(req.body);

    // Validar unicidad de `tipo` en el payload (DB lo enforcea vía
    // @@unique([contractId, tipo]) pero damos mejor error aquí)
    const tipos = data.map((d) => d.tipo);
    if (new Set(tipos).size !== tipos.length) {
      return res.status(400).json({
        error: 'Solo una declaración PEP por tipo (SOLICITANTE, PARIENTE, SOCIO_ACCIONISTA)',
      });
    }

    const declaraciones = await prisma.$transaction(async (tx) => {
      await tx.declaracionPEP.deleteMany({ where: { contractId: req.params.id } });
      if (data.length > 0) {
        await tx.declaracionPEP.createMany({
          data: data.map((d) => ({ ...d, contractId: req.params.id })) as any,
        });
      }
      return tx.declaracionPEP.findMany({ where: { contractId: req.params.id } });
    });

    return res.json(declaraciones);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    log.error({ err: error }, 'Upsert PEP error');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ── Obligados solidarios / Avales ───────────────────────────────────
// Los avales ahora viven en el expediente del contrato como
// ExpedienteActor de tipo AVAL. Endpoints:
//   POST   /api/contracts/:id/expediente/actores  (con tipo='AVAL')
//   PATCH  /api/expediente/actores/:actorId
//   DELETE /api/expediente/actores/:actorId
// Ver routes/expediente.ts.

// ─────────────────────────────────────────────────────────────────
// GET /api/contracts/:id/expediente.zip
//
// Descarga el expediente completo del contrato en un ZIP con la
// siguiente estructura:
//
//   <folio>/
//     cliente/<tipo>__<archivoOriginal>
//     contrato_<etapa>/<tipo>__<archivoOriginal>
//     aval_<orden>/<tipo>__<archivoOriginal>
//
// Solo se incluyen documentos con archivoUrl no nulo (es decir, los
// que tienen archivo físico subido). Si un actor no tiene docs, se
// omite su carpeta. Los archivos faltantes en disco se reportan en
// un archivo `_FALTANTES.txt` dentro del ZIP.
// ─────────────────────────────────────────────────────────────────

const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

/** Resuelve `/uploads/clientes/foo.pdf` → ruta absoluta segura dentro de UPLOADS_ROOT.
 *  Devuelve null si la ruta no es válida (path traversal, fuera de uploads, etc.). */
function resolveSafeUpload(relativeUrl: string): string | null {
  if (!relativeUrl) return null;
  const safe = relativeUrl.replace(/^\/+/, '');
  if (!safe.startsWith('uploads/')) return null;
  const inside = safe.slice('uploads/'.length);
  const full = path.resolve(UPLOADS_ROOT, inside);
  // Defensa contra path traversal: el resultado debe seguir bajo UPLOADS_ROOT.
  if (!full.startsWith(UPLOADS_ROOT + path.sep) && full !== UPLOADS_ROOT) return null;
  return full;
}

/** Sanitiza un fragmento de path para uso dentro del ZIP. */
function safePathFragment(s: string): string {
  return (s || 'sin_nombre').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

router.get('/:id/expediente.zip', requireAuth, async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        folio: true,
        actores: {
          orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
          include: {
            documentos: {
              where: { archivoUrl: { not: '' } },
              orderBy: [{ tipoDocumento: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contrato no encontrado' } });
    }

    const folio = safePathFragment(contract.folio || `contrato_${contract.id}`);

    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folio}_expediente.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });

    const faltantes: string[] = [];

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        log.warn({ err }, 'archiver warning ENOENT');
      } else {
        log.error({ err }, 'archiver warning');
      }
    });
    archive.on('error', (err) => {
      log.error({ err }, 'archiver error');
      // No podemos cambiar el status code en este punto; cerramos la conexión.
      try { res.end(); } catch (_) { /* ignore */ }
    });

    archive.pipe(res);

    // ── Carpetas por actor del expediente ────────────────────────
    // Estructura: <folio>/<TIPO>[_N][__SUBTIPO]/<tipoDocumento>__<original>
    for (const actor of contract.actores) {
      if (!actor.documentos || actor.documentos.length === 0) continue;
      const parts = [safePathFragment(actor.tipo)];
      // Si hay múltiples (AVAL 1, 2, ...) incluir el orden.
      if (actor.orden && actor.orden > 1) parts.push(String(actor.orden));
      const baseCarpeta = parts.join('_');
      const carpeta = actor.subtipo
        ? `${baseCarpeta}__${safePathFragment(actor.subtipo)}`
        : baseCarpeta;

      for (const doc of actor.documentos) {
        if (!doc.archivoUrl) continue;
        const abs = resolveSafeUpload(doc.archivoUrl);
        const original = doc.nombreArchivo || path.basename(doc.archivoUrl);
        const tipoDoc = safePathFragment(doc.tipoDocumento || 'libre');
        const entryName = `${folio}/${carpeta}/${tipoDoc}__${safePathFragment(original)}`;
        if (abs && fs.existsSync(abs)) {
          archive.file(abs, { name: entryName });
        } else {
          faltantes.push(`${entryName} (archivo no encontrado en disco: ${doc.archivoUrl})`);
        }
      }
    }

    if (faltantes.length > 0) {
      const txt = [
        `Reporte de archivos faltantes — generado ${new Date().toISOString()}`,
        `Folio: ${contract.folio}`,
        '',
        'Los siguientes documentos están registrados en BD pero su archivo físico',
        'no fue encontrado en el servidor:',
        '',
        ...faltantes.map((f, i) => `  ${i + 1}. ${f}`),
      ].join('\n');
      archive.append(txt, { name: `${folio}/_FALTANTES.txt` });
    }

    await archive.finalize();
  } catch (error) {
    log.error({ err: error }, 'Expediente ZIP error');
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error al generar ZIP del expediente' } });
    } else {
      try { res.end(); } catch (_) { /* ignore */ }
    }
  }
});

export default router;
