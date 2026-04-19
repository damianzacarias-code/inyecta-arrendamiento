/**
 * Notificaciones in-app — endpoints REST
 * ---------------------------------------------------------------
 * CLAUDE.md §9 T9.
 *
 * Todas las rutas requieren autenticación. Cada usuario sólo puede
 * leer y actualizar SUS PROPIAS notificaciones (filtrado por
 * req.user.userId). No hay endpoint público que permita ver las de
 * otro usuario.
 *
 *   GET    /api/notificaciones           lista paginada del usuario
 *          ?page, ?pageSize, ?soloNoLeidas=true, ?tipo=
 *   GET    /api/notificaciones/contador  { noLeidas: number }
 *   PATCH  /api/notificaciones/:id/leida marca una como leída
 *   PATCH  /api/notificaciones/leer-todas marca todas como leídas
 *   DELETE /api/notificaciones/:id        elimina una notificación propia
 */
import { Router } from 'express';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// ───────────────────────────────────────────────────────────────────
// GET /api/notificaciones — lista paginada del usuario autenticado
// ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const userId = req.user!.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const where: Record<string, unknown> = { userId };
  if (req.query.soloNoLeidas === 'true') where.leida = false;
  if (req.query.tipo) where.tipo = String(req.query.tipo);

  const [total, items, noLeidas] = await Promise.all([
    prisma.notificacion.count({ where }),
    prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificacion.count({ where: { userId, leida: false } }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    noLeidas,
    items,
  });
});

// ───────────────────────────────────────────────────────────────────
// GET /api/notificaciones/contador — sólo el número de no leídas
// (endpoint ligero para polling de la campana)
// ───────────────────────────────────────────────────────────────────

router.get('/contador', async (req, res) => {
  const userId = req.user!.userId;
  const noLeidas = await prisma.notificacion.count({ where: { userId, leida: false } });
  res.json({ noLeidas });
});

// ───────────────────────────────────────────────────────────────────
// PATCH /api/notificaciones/leer-todas — marca todas las del usuario
// como leídas. Útil al abrir el panel de la campana.
// ───────────────────────────────────────────────────────────────────

router.patch('/leer-todas', async (req, res) => {
  const userId = req.user!.userId;
  const result = await prisma.notificacion.updateMany({
    where: { userId, leida: false },
    data:  { leida: true, leidaAt: new Date() },
  });
  res.json({ ok: true, actualizadas: result.count });
});

// ───────────────────────────────────────────────────────────────────
// PATCH /api/notificaciones/:id/leida — marca UNA como leída
// (sólo si pertenece al usuario)
// ───────────────────────────────────────────────────────────────────

router.patch('/:id/leida', async (req, res) => {
  const userId = req.user!.userId;
  const noti = await prisma.notificacion.findUnique({ where: { id: req.params.id } });
  if (!noti || noti.userId !== userId) {
    return res.status(404).json({ error: 'Notificación no encontrada' });
  }
  if (noti.leida) {
    return res.json(noti); // idempotente
  }
  const actualizada = await prisma.notificacion.update({
    where: { id: req.params.id },
    data:  { leida: true, leidaAt: new Date() },
  });
  res.json(actualizada);
});

// ───────────────────────────────────────────────────────────────────
// DELETE /api/notificaciones/:id — elimina una notificación propia
// ───────────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  const userId = req.user!.userId;
  const noti = await prisma.notificacion.findUnique({ where: { id: req.params.id } });
  if (!noti || noti.userId !== userId) {
    return res.status(404).json({ error: 'Notificación no encontrada' });
  }
  await prisma.notificacion.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
