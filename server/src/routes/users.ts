/**
 * /api/users — Administración de usuarios (empleados de Inyecta)
 * ----------------------------------------------------------------
 *  GET    /api/users                  → ADMIN/DIRECTOR — listado completo
 *  POST   /api/users                  → ADMIN          — alta de usuario
 *  PATCH  /api/users/:id              → ADMIN          — edita nombre/rol/activo
 *  POST   /api/users/:id/reset-password → ADMIN        — fija nueva contraseña
 *  PATCH  /api/users/:id/deactivate   → ADMIN          — soft-disable (activo=false)
 *  PATCH  /api/users/:id/activate     → ADMIN          — re-habilita
 *
 * Decisiones:
 *  • Sin DELETE físico — el usuario tiene relaciones (cotizaciones, contratos,
 *    pagos, notas, bitácora, notificaciones) que no queremos cascade-borrar.
 *    "Dar de baja" = activo=false → el login lo rechaza ('Credenciales inválidas')
 *    pero su historial queda intacto para auditoría PLD.
 *  • Reset de contraseña no devuelve la nueva al cliente — el ADMIN la captura
 *    y la transmite por canal seguro (es responsabilidad del operador).
 *  • Cambio de rol restringido a ADMIN solamente (DIRECTOR puede listar pero
 *    no escalar privilegios).
 *  • Anti-lockout: el ADMIN no puede desactivarse a sí mismo ni quitarse el
 *    rol ADMIN. Si fuera el último ADMIN, la operación tampoco procede
 *    (validación contra count(rol=ADMIN, activo=true)).
 *  • Todas las escrituras quedan en bitácora vía el middleware global.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import prisma from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { childLogger } from '../lib/logger';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  assertPasswordStrong,
  hashPassword,
  setPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../lib/passwordPolicy';
import {
  onUserCreated,
  onUserRoleChanged,
  onUserDeactivated,
  onUserActivated,
  onPasswordResetByAdmin,
} from '../lib/securityAlerts';

const router = Router();
const log = childLogger('users');

// ── Schemas Zod ─────────────────────────────────────────────────────
//
// El enum de rol se duplica del schema.prisma a propósito: si un día
// agregamos "AUDITOR" al enum de Prisma pero no lo queremos asignable
// desde la UI todavía, lo dejamos fuera de aquí. Hoy refleja el enum
// completo (ADMIN/DIRECTOR/ANALISTA/COBRANZA/OPERACIONES/LEGAL).
const ROL_VALUES = ['ADMIN', 'DIRECTOR', 'ANALISTA', 'COBRANZA', 'OPERACIONES', 'LEGAL'] as const;
const rolSchema = z.enum(ROL_VALUES);

const createUserSchema = z.object({
  email:     z.string().email('Email inválido').max(120).toLowerCase(),
  // Solo validamos longitud aquí; la política de complejidad / historial
  // la corre assertPasswordStrong dentro del handler (necesita el ctx
  // con email/nombre/apellidos para detectar passwords personales).
  password:  z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  nombre:    z.string().min(1, 'Nombre requerido').max(80).trim(),
  apellidos: z.string().min(1, 'Apellidos requeridos').max(80).trim(),
  rol:       rolSchema,
});

const updateUserSchema = z.object({
  nombre:    z.string().min(1).max(80).trim().optional(),
  apellidos: z.string().min(1).max(80).trim().optional(),
  rol:       rolSchema.optional(),
  activo:    z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Sin cambios' });

const resetPasswordSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

// ── Helpers ─────────────────────────────────────────────────────────

const userPublic = {
  id: true,
  email: true,
  nombre: true,
  apellidos: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Cuenta cuántos ADMIN activos hay además de `excludeId` (si se pasa).
 * Lo usamos para impedir que el último ADMIN se autodesactive o se
 * quite el rol — un sistema sin ADMIN queda bloqueado para siempre,
 * habría que ir a la BD a mano para arreglarlo.
 */
async function countOtherActiveAdmins(excludeId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      rol: 'ADMIN',
      activo: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

// ── Rutas ───────────────────────────────────────────────────────────

/**
 * GET /api/users
 *
 * Listado completo. ADMIN y DIRECTOR pueden ver — DIRECTOR como
 * lectura ejecutiva sin poder editar.
 */
router.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  asyncHandler(async (_req: Request, res) => {
    const users = await prisma.user.findMany({
      select: userPublic,
      orderBy: [{ activo: 'desc' }, { rol: 'asc' }, { apellidos: 'asc' }],
    });
    res.json({ users });
  }),
);

/**
 * POST /api/users
 *
 * Alta de empleado. Solo ADMIN. Reglas:
 *   - email único (case-insensitive — ya guardamos en lowercase).
 *   - bcrypt 12 rondas (igual que /auth/register).
 *   - el creador queda en bitácora vía middleware.
 */
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const data = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError('EMAIL_EXISTS', 'Ya existe un usuario con ese email', 409);
    }

    // Política de fuerza con contexto del usuario nuevo (email/nombre/
    // apellidos) para rechazar contraseñas que los contengan.
    assertPasswordStrong(data.password, {
      email:     data.email,
      nombre:    data.nombre,
      apellidos: data.apellidos,
    });

    const hashedPassword = await hashPassword(data.password);
    // mustChangePassword=true para que el usuario cambie la pass que
    // el ADMIN capturó por él al primer login. Esto cierra el flujo
    // de "el ADMIN conoce mi contraseña inicial".
    const user = await prisma.user.create({
      data: {
        email:              data.email,
        password:           hashedPassword,
        nombre:             data.nombre,
        apellidos:          data.apellidos,
        rol:                data.rol,
        mustChangePassword: true,
        passwordChangedAt:  new Date(),
      },
      select: userPublic,
    });

    log.info({ creadoPor: req.user?.userId, nuevoUserId: user.id, rol: user.rol }, 'usuario creado');
    void onUserCreated({
      actorId:      req.user!.userId,
      actorEmail:   req.user!.email,
      newUserId:    user.id,
      newUserEmail: user.email,
      rol:          user.rol,
    });
    res.status(201).json(user);
  }),
);

/**
 * PATCH /api/users/:id
 *
 * Edita nombre/apellidos/rol/activo. Solo ADMIN.
 *
 * Anti-lockout:
 *   - Si el target es el ADMIN actual y se intenta cambiar rol o desactivar,
 *     bloqueamos cuando sería el último ADMIN activo del sistema.
 *   - El ADMIN tampoco puede quitarse a sí mismo el rol ADMIN (incluso si
 *     hay otros) — debe pedir a otro ADMIN que lo haga, para evitar el
 *     "yo me bajo y ahora no puedo arreglarlo".
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);
    const actorId = req.user?.userId;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
    }

    const isSelf = actorId === id;

    // No autodegradación de ADMIN.
    if (isSelf && data.rol && data.rol !== 'ADMIN') {
      throw new AppError('SELF_DEMOTION', 'Pide a otro ADMIN que cambie tu rol', 409);
    }
    // No autodesactivación.
    if (isSelf && data.activo === false) {
      throw new AppError('SELF_DEACTIVATION', 'No puedes desactivarte a ti mismo', 409);
    }
    // Si bajamos el rol del target o lo desactivamos, y target era ADMIN
    // activo, exigimos que quede al menos un ADMIN activo en el sistema.
    const dejaríaSinAdmin =
      target.rol === 'ADMIN' &&
      target.activo &&
      ((data.rol && data.rol !== 'ADMIN') || data.activo === false);
    if (dejaríaSinAdmin) {
      const remaining = await countOtherActiveAdmins(id);
      if (remaining === 0) {
        throw new AppError('LAST_ADMIN', 'No puedes dejar al sistema sin ningún ADMIN activo', 409);
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: userPublic,
    });

    log.info({ actorId, targetId: id, cambios: Object.keys(data) }, 'usuario actualizado');

    // Alertas de seguridad para cambios sensibles. Cada handler aplica
    // sus propios filtros (rolAnterior===rolNuevo no dispara, etc.).
    if (data.rol && data.rol !== target.rol) {
      void onUserRoleChanged({
        actorId:      req.user!.userId,
        actorEmail:   req.user!.email,
        targetId:     id,
        targetEmail:  target.email,
        rolAnterior:  target.rol,
        rolNuevo:     data.rol,
      });
    }
    if (data.activo === false && target.activo === true) {
      void onUserDeactivated({
        actorId:     req.user!.userId,
        actorEmail:  req.user!.email,
        targetId:    id,
        targetEmail: target.email,
      });
    }
    if (data.activo === true && target.activo === false) {
      void onUserActivated({
        actorId:     req.user!.userId,
        actorEmail:  req.user!.email,
        targetId:    id,
        targetEmail: target.email,
      });
    }
    res.json(updated);
  }),
);

/**
 * POST /api/users/:id/reset-password
 *
 * Solo ADMIN. La nueva contraseña la captura el ADMIN y la transmite
 * por canal seguro al usuario; no la devolvemos en el response (no
 * queremos que quede en logs ni en pestañas abiertas).
 */
router.post(
  '/:id/reset-password',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const { id } = req.params;
    const { password } = resetPasswordSchema.parse(req.body);

    const target = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, email: true, nombre: true, apellidos: true },
    });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
    }

    // Validar fuerza con contexto del target (no del actor) — la pass
    // pertenece al usuario reseteado.
    assertPasswordStrong(password, {
      email:     target.email,
      nombre:    target.nombre,
      apellidos: target.apellidos,
    });

    // setPassword empuja la actual al historial, actualiza
    // passwordChangedAt y marca mustChangePassword=true (el usuario
    // debe cambiar la pass temporal que el ADMIN le compartió).
    // NO chequea reuso aquí: el ADMIN no debe enterarse de las
    // contraseñas anteriores del target. Si la pass coincide con
    // alguna previa, igual queda registrada — el operador transmitió
    // esa pass por canal seguro y el usuario la cambia al login.
    await setPassword(id, password, { mustChange: true });

    log.info({ actorId: req.user?.userId, targetId: id }, 'password reseteado');
    void onPasswordResetByAdmin({
      actorId:     req.user!.userId,
      actorEmail:  req.user!.email,
      targetId:    id,
      targetEmail: target.email,
    });
    res.json({ ok: true });
  }),
);

/**
 * PATCH /api/users/:id/deactivate y /activate
 *
 * Atajos sobre PATCH /:id { activo: bool }. Existen como rutas separadas
 * para que la bitácora deje un registro semánticamente claro
 * ("USER_DEACTIVATED" vs "USER_UPDATED").
 */
router.patch(
  '/:id/deactivate',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const { id } = req.params;
    const actorId = req.user?.userId;

    if (actorId === id) {
      throw new AppError('SELF_DEACTIVATION', 'No puedes desactivarte a ti mismo', 409);
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
    }

    if (target.rol === 'ADMIN' && target.activo) {
      const remaining = await countOtherActiveAdmins(id);
      if (remaining === 0) {
        throw new AppError('LAST_ADMIN', 'No puedes dejar al sistema sin ningún ADMIN activo', 409);
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { activo: false },
      select: userPublic,
    });
    log.info({ actorId, targetId: id }, 'usuario desactivado');
    if (target.activo) {
      void onUserDeactivated({
        actorId:     req.user!.userId,
        actorEmail:  req.user!.email,
        targetId:    id,
        targetEmail: target.email,
      });
    }
    res.json(updated);
  }),
);

router.patch(
  '/:id/activate',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res) => {
    const { id } = req.params;
    const target = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, email: true, activo: true },
    });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { activo: true },
      select: userPublic,
    });
    log.info({ actorId: req.user?.userId, targetId: id }, 'usuario re-activado');
    if (!target.activo) {
      void onUserActivated({
        actorId:     req.user!.userId,
        actorEmail:  req.user!.email,
        targetId:    id,
        targetEmail: target.email,
      });
    }
    res.json(updated);
  }),
);

export default router;
