import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { childLogger } from '../lib/logger';
import { createClientSchema, updateClientSchema } from '../schemas/client';

const log = childLogger('clients');

const router = Router();

// NOTA: el checklist de documentos del CLIENTE (ClientDocument) fue
// eliminado en favor del expediente POR CONTRATO (ExpedienteActor +
// ExpedienteDocumento). Cada operación tiene su propio expediente,
// porque los avales y el bien arrendado cambian operación a operación.
// Ver routes/expediente.ts.

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

    // Reload completo con todas las relaciones KYC. El expediente de
    // documentos vive a nivel de contrato — no se carga aquí.
    const clientFull = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
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
          _count: { select: { cotizaciones: true, contratos: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    return res.json({
      data: clients,
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

// NOTA: el endpoint PUT /api/clients/:id/documents/:docId fue
// removido. Para gestionar documentos del expediente de un contrato:
//   POST   /api/expediente/actores/:actorId/documentos
//   PATCH  /api/expediente/documentos/:docId
//   DELETE /api/expediente/documentos/:docId

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
