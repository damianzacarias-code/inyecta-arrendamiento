/**
 * errorHandler.ts — Manejo central de errores no atrapados.
 *
 * Filosofía:
 *   • Cualquier error que llegue a `next(err)` o que reviente dentro de un
 *     handler async se serializa con un formato CONSISTENTE:
 *
 *         { error: { code: string, message: string, details?: unknown } }
 *
 *   • Esto permite que el cliente discrimine errores por `code` sin parsear
 *     mensajes humanos.
 *   • No rompe rutas legacy que ya devuelven `{ error: 'string' }` directo —
 *     solo aplica a errores que llegan a este middleware (vía `next(err)` o
 *     `throw` en handler async wrappeado).
 *
 * Cómo se usa:
 *   - Lanza `new AppError('CLIENT_NOT_FOUND', 'Cliente no encontrado', 404)`
 *     para errores de negocio explícitos.
 *   - O simplemente `throw new Error(...)` y el handler responderá 500 con
 *     code = INTERNAL_ERROR (ocultando el stack en producción).
 *   - Los errores de Zod y Prisma se mapean automáticamente a códigos HTTP
 *     y de aplicación apropiados.
 */
import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { config } from '../config/env';

// ───────────────────────────────────────────────────────────────────
// AppError — para errores de negocio explícitos
// ───────────────────────────────────────────────────────────────────
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ───────────────────────────────────────────────────────────────────
// Wrapper async que captura promises rechazadas
// (Express 4 no las atrapa por defecto)
// ───────────────────────────────────────────────────────────────────
export function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ───────────────────────────────────────────────────────────────────
// Mapping de PrismaClientKnownRequestError → { code, status }
// Códigos: https://www.prisma.io/docs/reference/api-reference/error-reference
// ───────────────────────────────────────────────────────────────────
function mapPrismaKnownError(err: Prisma.PrismaClientKnownRequestError): {
  code: string;
  status: number;
  message: string;
  details?: unknown;
} {
  switch (err.code) {
    case 'P2000': // Value too long for column
      return { code: 'VALUE_TOO_LONG', status: 400, message: 'Valor demasiado largo para el campo', details: err.meta };
    case 'P2002': {
      // Unique constraint violation
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'campo único';
      return {
        code: 'UNIQUE_VIOLATION',
        status: 409,
        message: `Ya existe un registro con el mismo valor en: ${target}`,
        details: err.meta,
      };
    }
    case 'P2003': // Foreign key constraint
      return { code: 'FOREIGN_KEY_VIOLATION', status: 409, message: 'Referencia a registro inexistente', details: err.meta };
    case 'P2014': // Required relation missing
      return { code: 'RELATION_VIOLATION', status: 400, message: 'La operación viola una relación requerida', details: err.meta };
    case 'P2025': // Record not found (update/delete)
      return { code: 'NOT_FOUND', status: 404, message: 'Registro no encontrado', details: err.meta };
    case 'P2021': // Table does not exist
    case 'P2022': // Column does not exist
      return { code: 'SCHEMA_MISMATCH', status: 500, message: 'Esquema de BD desactualizado', details: err.meta };
    default:
      return { code: `PRISMA_${err.code}`, status: 400, message: err.message.split('\n').pop()?.trim() ?? 'Error de base de datos', details: err.meta };
  }
}

// ───────────────────────────────────────────────────────────────────
// 404 handler — para /api/* que no matchea ninguna ruta
// ───────────────────────────────────────────────────────────────────
export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    },
  });
}

// ───────────────────────────────────────────────────────────────────
// Error handler central — debe ir AL FINAL de los middlewares
// ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Si ya se enviaron headers, delegamos a Express (para que cierre el stream)
  if (res.headersSent) {
    console.error('[errorHandler] Headers ya enviados, error:', err);
    return;
  }

  // ── 1. AppError (error de negocio explícito) ──────────────────
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
  }

  // ── 2. ZodError (validación) ──────────────────────────────────
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
    });
  }

  // ── 3. Prisma — errores conocidos ─────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaKnownError(err);
    return res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details !== undefined ? { details: mapped.details } : {}),
      },
    });
  }

  // ── 4. Prisma — validación de inputs (e.g. tipo incorrecto) ───
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: {
        code: 'PRISMA_VALIDATION_ERROR',
        message: 'Parámetros de consulta inválidos',
        // El mensaje crudo de Prisma es enorme; lo recortamos
        details: config.nodeEnv === 'development' ? err.message : undefined,
      },
    });
  }

  // ── 5. SyntaxError de body-parser (JSON malformado) ───────────
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'JSON malformado en el body',
      },
    });
  }

  // ── 5b. PayloadTooLargeError de body-parser ───────────────────
  // body-parser lanza un Error con .type === 'entity.too.large' y .status 413.
  if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.too.large'
  ) {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'El cuerpo de la petición excede el límite permitido (1mb)',
      },
    });
  }

  // ── 6. Catch-all ──────────────────────────────────────────────
  const message = err instanceof Error ? err.message : 'Error interno';
  // Loggea el stack siempre — clave para debugging post-mortem
  console.error('[errorHandler] Error no manejado:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      // En producción ocultamos el mensaje (puede leak detalles internos)
      message: config.nodeEnv === 'production' ? 'Error interno del servidor' : message,
      ...(config.nodeEnv === 'development' && err instanceof Error
        ? { details: { stack: err.stack?.split('\n').slice(0, 6) } }
        : {}),
    },
  });
}
