import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/db';
import { config } from '../config/env';
import { requireAuth, invalidateUserPwdCache } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';
import { childLogger } from '../lib/logger';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  assertPasswordStrong,
  assertNotReusedRecently,
  setPassword,
  hashPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../lib/passwordPolicy';
import { onLoginFailed, onPasswordChanged } from '../lib/securityAlerts';
import { revokeToken, revokeAllForUser } from '../lib/tokenRevocation';

const log = childLogger('auth');

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  // Login NO valida fuerza — solo presencia. Si bajamos la mínima
  // longitud aquí, las cuentas viejas con passwords cortas que aún no
  // han migrado pueden seguir entrando para luego cambiarla.
  password: z.string().min(1, 'Contraseña requerida'),
});

const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  nombre: z.string().min(1, 'Nombre requerido'),
  apellidos: z.string().min(1, 'Apellidos requeridos'),
  // El enum incluye LEGAL (espejo de UserRole en schema.prisma).
  rol: z.enum(['ADMIN', 'DIRECTOR', 'ANALISTA', 'COBRANZA', 'OPERACIONES', 'LEGAL']).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword:     z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

// POST /api/auth/login
// Rate-limited: 5 intentos fallidos / 15 min / IP.
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.activo) {
      // Fire-and-forget: alerta de seguridad. void evita que el SMTP
      // ralentice la respuesta del login.
      void onLoginFailed({ ip: req.ip ?? 'unknown', emailIntentado: data.email });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      void onLoginFailed({ ip: req.ip ?? 'unknown', emailIntentado: data.email });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // jti = identificador único del token. Necesario para que /logout
    // pueda revocar este JWT específico vía revoked_tokens.
    // CLAUDE.md §10 — Hardening S4.
    const jti = randomUUID();
    const signOptions: SignOptions = {
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
      jwtid:     jti,
    };
    const token = jwt.sign(
      { userId: user.id, email: user.email, rol: user.rol },
      config.jwtSecret,
      signOptions
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        rol: user.rol,
        // mustChangePassword: si true, el frontend debe forzar al
        // usuario a /cambiar-password antes de cualquier otra ruta.
        // CLAUDE.md §10 — Hardening S1.
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    log.error({ err: error }, 'Login error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/register (solo ADMIN puede registrar usuarios)
router.post('/register', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.rol !== 'ADMIN') {
      return res.status(403).json({ error: 'Solo administradores pueden crear usuarios' });
    }

    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
    }

    // Política de fuerza con contexto del usuario nuevo.
    assertPasswordStrong(data.password, {
      email:     data.email,
      nombre:    data.nombre,
      apellidos: data.apellidos,
    });

    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email:              data.email,
        password:           hashedPassword,
        nombre:             data.nombre,
        apellidos:          data.apellidos,
        rol:                data.rol || 'ANALISTA',
        mustChangePassword: true,  // legacy bootstrap path
        passwordChangedAt:  new Date(),
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellidos: true,
        rol: true,
        createdAt: true,
      },
    });

    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    log.error({ err: error }, 'Register error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellidos: true,
        rol: true,
        createdAt: true,
        mustChangePassword: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.json(user);
  } catch (error) {
    log.error({ err: error }, 'Me error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/auth/change-password
 *
 * Cambio voluntario o forzado (mustChangePassword=true) de la contraseña
 * del usuario autenticado. Reglas:
 *   - Requiere conocer la contraseña actual (anti-hijack del token).
 *   - La nueva contraseña pasa por la política completa
 *     (assertPasswordStrong + assertNotReusedRecently).
 *   - setPassword empuja la actual al historial, actualiza
 *     passwordChangedAt y baja mustChangePassword a false.
 *   - El response NO incluye datos sensibles. El cliente debería
 *     refrescar /api/auth/me para sincronizar mustChangePassword.
 *
 * Pendiente para S4: invalidar JWTs emitidos antes de
 * passwordChangedAt — hoy el token sigue siendo válido hasta su
 * expiración natural.
 */
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const data = changePasswordSchema.parse(req.body);
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, nombre: true, apellidos: true, password: true, activo: true },
    });
    if (!user || !user.activo) {
      // Mismo mensaje que login para no leak user-enum.
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    }

    // Verificar contraseña actual (no exponemos si fue la actual o la
    // nueva la que falló — el caller siempre obtiene el mismo error).
    const ok = await bcrypt.compare(data.currentPassword, user.password);
    if (!ok) {
      throw new AppError('INVALID_CREDENTIALS', 'La contraseña actual es incorrecta', 401);
    }

    // Política completa sobre la nueva contraseña.
    assertPasswordStrong(data.newPassword, {
      email:     user.email,
      nombre:    user.nombre,
      apellidos: user.apellidos,
    });
    await assertNotReusedRecently(userId, data.newPassword);

    // Persistir + bajar mustChangePassword (cambio voluntario).
    await setPassword(userId, data.newPassword, { mustChange: false });

    // S4: invalidar cache local de passwordChangedAt para que el
    // mismo proceso ya rechace tokens viejos sin esperar TTL de 60s.
    invalidateUserPwdCache(userId);

    log.info({ userId }, 'password cambiado por el usuario');
    void onPasswordChanged({ userId, email: user.email });
    res.json({ ok: true });
  }),
);

/**
 * POST /api/auth/logout
 *
 * Revoca el JWT actual (server-side) registrando su jti en
 * revoked_tokens. requireAuth lo rechazará en cualquier request
 * posterior. Idempotente: dos logouts seguidos no fallan.
 *
 * Si el token no trae jti (edge case: tokens viejos emitidos antes
 * de S4) lo aceptamos pero no revocamos — el cliente deberá
 * descartarlo localmente (la próxima emisión sí traerá jti).
 */
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { jti, userId, exp } = req.user!;
    if (jti && exp) {
      await revokeToken({
        jti,
        userId,
        expiresAt: new Date(exp * 1000),
        reason:    'logout',
      });
    }
    res.json({ ok: true });
  }),
);

/**
 * POST /api/auth/logout-all
 *
 * "Cerrar todas las sesiones" — bumpea passwordChangedAt sin tocar
 * la password real. requireAuth rechaza cualquier token con
 * iat < passwordChangedAt, lo que invalida TODOS los JWTs vivos del
 * usuario en cualquier réplica, sin necesidad de saber sus jtis.
 *
 * El usuario sigue pudiendo usar su contraseña actual para volver
 * a iniciar sesión.
 */
router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.user!;
    await prisma.user.update({
      where: { id: userId },
      data:  { passwordChangedAt: new Date() },
    });
    invalidateUserPwdCache(userId);
    // Limpia también los jtis revocados explícitos del user — ya no
    // hace falta acumularlos (todos quedan invalidados por iat).
    await revokeAllForUser(userId);
    log.info({ userId }, 'logout-all (todas las sesiones invalidadas)');
    res.json({ ok: true });
  }),
);

export default router;
