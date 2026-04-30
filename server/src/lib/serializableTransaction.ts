/**
 * Helper para ejecutar operaciones read-then-write contra estado compartido
 * de forma segura ante concurrencia.
 *
 * El problema:
 *   Sin transacción, dos requests que llegan al mismo tiempo pueden:
 *     T1 lee estado X
 *     T2 lee estado X (idéntico — no ven al otro)
 *     T1 calcula y escribe basado en X
 *     T2 calcula y escribe basado en X ← ya viejo
 *   Resultado: doble aplicación, contadores incorrectos, race conditions.
 *
 * La solución:
 *   Postgres en isolation level "Serializable" detecta este escenario y
 *   aborta la TX perdedora con error 40001 (P2034 en Prisma). Aquí lo
 *   manejamos haciendo retry con backoff exponencial: el reintento ya verá
 *   el estado actualizado por la TX que sí commit-ó.
 *
 * Cuándo usarlo:
 *   • POST /api/cobranza/pay   — registrar un pago (lee prevPayments, crea Payment).
 *   • Cualquier futuro endpoint donde "lee estado X → calcula → escribe" sobre
 *     una entidad sensible a concurrencia.
 *
 * NO usarlo para:
 *   • Reads puros (no hace falta).
 *   • Writes únicos sin dependencia del estado leído.
 *   • Operaciones que requieren llamar a APIs externas (CFDI, email) — esas
 *     NUNCA deben estar dentro de una transacción de BD: si la TX se
 *     reinicia se duplica la llamada externa. Hazlas DESPUÉS de la TX.
 */
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { childLogger } from './logger';

const log = childLogger('serializable-tx');

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 50;
const TX_TIMEOUT_MS = 8000;
const TX_MAX_WAIT_MS = 4000;

/**
 * Ejecuta `fn` en una transacción Prisma con isolation level Serializable.
 * Si Postgres reporta serialization failure (P2034) reintenta hasta
 * MAX_RETRIES veces con backoff exponencial + jitter.
 *
 * `ctx` es opcional pero recomendado: aparece en los logs de retry para
 * que correlaciones a una request específica con su X-Request-ID.
 */
export async function serializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ctx?: { reqId?: string; route?: string },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: 'Serializable',
        timeout: TX_TIMEOUT_MS,
        maxWait: TX_MAX_WAIT_MS,
      });
    } catch (err) {
      lastError = err;
      const isSerializationFailure =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';

      if (!isSerializationFailure || attempt >= MAX_RETRIES) {
        throw err;
      }

      // Backoff exponencial con jitter para evitar lockstep entre retries.
      const backoff = Math.round(
        BASE_BACKOFF_MS * Math.pow(2, attempt - 1) * (0.5 + Math.random()),
      );
      log.warn(
        { attempt, backoffMs: backoff, route: ctx?.route, reqId: ctx?.reqId },
        'serialization conflict, retrying',
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  // No debería llegar aquí: el último iter del loop o retorna o lanza.
  // Defensivo por si en el futuro alguien sube MAX_RETRIES y olvida cerrar el flow.
  throw lastError;
}
