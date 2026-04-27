/**
 * auth.ts — middlewares de autenticación y autorización.
 *
 * requireAuth aplica TRES barreras al token JWT:
 *   1. jwt.verify() (firma + exp)
 *   2. tokenRevocation.isRevoked(jti) — logout server-side (S4)
 *   3. iat ≥ user.passwordChangedAt — invalidar tokens emitidos
 *      antes de un cambio de password (S1+S4)
 *
 * El payload válido se expone en req.user. La info se cachea en
 * memoria (TTL 60s) para evitar un round-trip a Postgres por cada
 * request — para 10 usuarios concurrentes la lookup de
 * passwordChangedAt sería el cuello de botella sin esto.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import prisma from '../config/db';
import { isRevoked } from '../lib/tokenRevocation';
import { childLogger } from '../lib/logger';

const log = childLogger('auth-mw');

export interface AuthPayload {
  userId: string;
  email:  string;
  rol:    string;
  jti?:   string;
  iat?:   number;
  exp?:   number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// ── Cache in-memory de passwordChangedAt por userId ────────────────
//
// TTL corto (60s) — basta para amortizar requests dentro de la misma
// "sesión activa" del usuario sin retrasar la invalidación de tokens
// tras un cambio de password (al cambiar, el cliente reemite el JWT
// inmediatamente; el peor caso es 60s con un token viejo).
//
// Espacio: ~16 bytes/entrada. Para 100 usuarios activos = 1.6KB.
interface PwdCacheEntry { changedAt: number; activo: boolean; expiresAt: number }
const pwdCache = new Map<string, PwdCacheEntry>();
const PWD_CACHE_TTL_MS = 60_000;

async function loadPwdInfo(userId: string): Promise<PwdCacheEntry | null> {
  const now = Date.now();
  const cached = pwdCache.get(userId);
  if (cached && cached.expiresAt > now) return cached;

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { passwordChangedAt: true, activo: true },
  });
  if (!user) return null;

  const entry: PwdCacheEntry = {
    changedAt: user.passwordChangedAt.getTime(),
    activo:    user.activo,
    expiresAt: now + PWD_CACHE_TTL_MS,
  };
  pwdCache.set(userId, entry);
  // Limpieza oportunista: si el map crece, purgamos vencidos.
  if (pwdCache.size > 500) {
    for (const [k, v] of pwdCache) if (v.expiresAt <= now) pwdCache.delete(k);
  }
  return entry;
}

/** Para tests / cambio de password en la misma instancia: invalida cache. */
export function invalidateUserPwdCache(userId: string): void {
  pwdCache.delete(userId);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const token = authHeader.split(' ')[1];
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  // Barrera 2: revocación explícita (logout).
  if (isRevoked(payload.jti)) {
    return res.status(401).json({ error: 'Token revocado' });
  }

  // Barrera 3: invalidación por cambio de password / desactivación.
  // Async pero rápido — usa cache de 60s.
  loadPwdInfo(payload.userId)
    .then((info) => {
      if (!info) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }
      if (!info.activo) {
        return res.status(401).json({ error: 'Cuenta desactivada' });
      }
      // iat es en segundos (epoch). Si el token se emitió ANTES del
      // último cambio de password, ya no vale.
      if (payload.iat && payload.iat * 1000 < info.changedAt - 1000) {
        return res.status(401).json({ error: 'Token emitido antes de un cambio de credenciales' });
      }
      req.user = payload;
      next();
    })
    .catch((err) => {
      log.error({ err }, 'requireAuth: fallo al validar passwordChangedAt');
      return res.status(500).json({ error: 'Error interno de autenticación' });
    });
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}
