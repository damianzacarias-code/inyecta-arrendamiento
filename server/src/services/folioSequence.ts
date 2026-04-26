/**
 * Generación atómica de folios consecutivos.
 *
 * Reemplaza el patrón inseguro `prisma.contract.count() + 1`, que tenía
 * race condition: dos requests concurrentes leían el mismo count y
 * generaban el mismo folio. El primer INSERT pasaba; el segundo rompía
 * en el unique constraint (P2002). En producción con varios usuarios
 * dando de alta contratos a la vez, esto era una falla esperando ocurrir.
 *
 * Implementación: tabla `folio_sequences` con UPSERT + increment dentro
 * de una transacción. Postgres serializa las escrituras a una misma fila
 * vía row lock, garantizando que cada llamador obtiene un valor único
 * monotónico (no necesariamente consecutivo si una transacción aborta
 * después de incrementar — eso es ACEPTABLE: los folios pueden tener
 * saltos pero NUNCA duplicarse).
 *
 * IMPORTANTE: llamar SIEMPRE dentro de la misma transacción que crea la
 * entidad cuyo folio estamos asignando. Si la transacción aborta (ej. el
 * INSERT del Contract falla por validación), el incremento se revierte
 * automáticamente y el folio queda disponible para el siguiente.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

/**
 * Devuelve el siguiente número de folio para el scope+year dado, atómico.
 *
 * @param tx     Cliente de transacción (Prisma `$transaction` callback).
 * @param scope  'CONTRACT' | 'QUOTATION' | `INVOICE_${serie}` | …
 * @param year   Año (ej. 2026) si la serie rota anual; 0 si es continua.
 * @returns      Entero ≥ 1 único para ese (scope, year).
 */
export async function nextFolio(
  tx: Tx,
  scope: string,
  year: number,
): Promise<number> {
  // UPSERT + increment: si la fila no existe la crea con ultimo=1; si
  // existe, suma 1. RETURNING devuelve el valor post-update (Prisma lo
  // expone como el `update` payload).
  const row = await tx.folioSequence.upsert({
    where:  { scope_year: { scope, year } },
    create: { scope, year, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return row.ultimo;
}

/**
 * Helper de conveniencia: genera el folio formateado para contratos
 * (ARR-NNN-YYYY). NNN paddeado a 3 dígitos.
 */
export async function nextContractFolio(
  tx: Tx,
  year: number = new Date().getFullYear(),
): Promise<{ folio: string; numero: number }> {
  const numero = await nextFolio(tx, 'CONTRACT', year);
  return {
    folio: `ARR-${String(numero).padStart(3, '0')}-${year}`,
    numero,
  };
}

/**
 * Helper de conveniencia: genera folio para cotizaciones (COT-NNNN).
 * No rota anual — los folios de cotización son una serie continua.
 */
export async function nextQuotationFolio(
  tx: Tx,
): Promise<{ folio: string; numero: number }> {
  const numero = await nextFolio(tx, 'QUOTATION', 0);
  return {
    folio: `COT-${String(numero).padStart(4, '0')}`,
    numero,
  };
}

/**
 * Helper de conveniencia: folio Int por serie SAT (CFDI). El folio se
 * usa tal cual (sin padding) porque el SAT lo espera como entero.
 */
export async function nextInvoiceFolio(
  tx: Tx,
  serie: string,
): Promise<number> {
  return nextFolio(tx, `INVOICE_${serie}`, 0);
}

// ─────────────────────────────────────────────────────────────────────
// Backfill — útil al migrar desde el patrón viejo (count+1) para que la
// secuencia arranque sin colisionar con folios ya existentes.
// ─────────────────────────────────────────────────────────────────────

/**
 * Sincroniza la secuencia con el máximo folio numérico actual.
 *
 * NO debería llamarse en runtime. Existe para una migración one-shot:
 * cuando este módulo entra al sistema y la tabla folio_sequences está
 * vacía pero ya hay contratos creados con el patrón viejo.
 *
 * Idempotente: setea `ultimo = max(folio actual)`. Si la tabla ya tiene
 * un valor mayor, lo deja. Si no, lo sube.
 */
export async function backfillSequenceFromMax(
  prisma: PrismaClient,
  scope: string,
  year: number,
  currentMax: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.folioSequence.findUnique({
      where: { scope_year: { scope, year } },
    });
    if (!existing) {
      await tx.folioSequence.create({ data: { scope, year, ultimo: currentMax } });
      logger.info({ scope, year, currentMax }, 'folio sequence backfilled');
    } else if (existing.ultimo < currentMax) {
      await tx.folioSequence.update({
        where: { scope_year: { scope, year } },
        data:  { ultimo: currentMax },
      });
      logger.info({ scope, year, from: existing.ultimo, to: currentMax }, 'folio sequence advanced');
    }
  });
}
