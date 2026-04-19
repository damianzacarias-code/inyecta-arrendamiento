/**
 * GET /api/bitacora — consulta paginada de la bitácora de auditoría.
 *
 * Acceso restringido a ADMIN y DIRECTOR (la bitácora contiene PII).
 *
 * Query params:
 *   page         (1-based, default 1)
 *   pageSize     (default 50, max 200)
 *   usuarioId    filtra por usuario
 *   entidad      filtra por entidad ej: "Contract"
 *   entidadId    filtra por id del recurso
 *   accion       CREATE | UPDATE | DELETE | LOGIN ...
 *   desde, hasta ISO date strings
 *   q            búsqueda libre en ruta + email
 */
import { Router } from 'express';
import prisma from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'DIRECTOR'));

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

  const where: Record<string, unknown> = {};
  if (req.query.usuarioId) where.usuarioId = String(req.query.usuarioId);
  if (req.query.entidad)   where.entidad   = String(req.query.entidad);
  if (req.query.entidadId) where.entidadId = String(req.query.entidadId);
  if (req.query.accion)    where.accion    = String(req.query.accion);

  if (req.query.desde || req.query.hasta) {
    const range: Record<string, Date> = {};
    if (req.query.desde) range.gte = new Date(String(req.query.desde));
    if (req.query.hasta) range.lte = new Date(String(req.query.hasta));
    where.createdAt = range;
  }

  if (req.query.q) {
    const q = String(req.query.q);
    where.OR = [
      { ruta:         { contains: q, mode: 'insensitive' } },
      { usuarioEmail: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.bitacora.count({ where }),
    prisma.bitacora.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    items,
  });
});

router.get('/:id', async (req, res) => {
  const item = await prisma.bitacora.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(item);
});

export default router;
