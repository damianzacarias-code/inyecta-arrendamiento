/**
 * requestId.ts — Asigna un identificador único por request.
 *
 * Por qué:
 *   - Permite correlacionar logs distribuidos (pino) con entradas de
 *     bitácora y con respuestas vistas por el cliente.
 *   - Cuando algo falla en producción, el cliente puede pegar el
 *     `X-Request-ID` que recibió y nosotros saltamos directo a esa
 *     transacción en CloudWatch / Datadog / Loki.
 *
 * Comportamiento:
 *   - Si el request entrante trae `X-Request-ID` (típico cuando un
 *     proxy / API gateway ya lo asignó), lo respetamos — siempre que
 *     pase la validación: máximo 200 chars, solo [A-Za-z0-9_-:]+.
 *     Esto evita que un cliente malicioso inyecte header values con
 *     CRLF o control chars.
 *   - Si no, generamos un UUID v4.
 *   - Lo exponemos en `req.id` para el resto del pipeline (logger,
 *     bitácora, errorHandler) y lo agregamos al response como
 *     `X-Request-ID` para que el cliente lo conserve.
 *
 * Debe montarse ANTES de pino-http (para que `genReqId` lo recoja) y
 * antes de la bitácora (para que la registre).
 */
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Aumenta Express.Request con `id` para que el resto del backend lo
// consuma sin hacer casts ad-hoc. Se mezcla con la augmentation que
// hace `auth.ts` para `req.user`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const HEADER_IN = 'x-request-id';
const HEADER_OUT = 'X-Request-ID';
const MAX_LEN = 200;
// Permitimos los chars típicos de UUIDs, ULIDs y traceparents (no `;`,
// no `=`, no whitespace; nada que pueda colarse en headers o logs).
const SAFE = /^[A-Za-z0-9_\-:.]+$/;

export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers[HEADER_IN];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

    let id: string;
    if (
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      candidate.length <= MAX_LEN &&
      SAFE.test(candidate)
    ) {
      id = candidate;
    } else {
      id = randomUUID();
    }

    req.id = id;
    res.setHeader(HEADER_OUT, id);
    next();
  };
}
