/**
 * expedienteSeeder.ts
 * ──────────────────────────────────────────────────────────────────
 * Crea los actores fijos del expediente al momento de instanciar
 * un nuevo contrato. Los AVALES se agregan después manualmente
 * desde la UI (son 0..N).
 *
 * Uso: dentro de una transacción Prisma, justo después de crear
 * el contrato.
 *
 *   await prisma.$transaction(async (tx) => {
 *     const c = await tx.contract.create({...});
 *     await sembrarActoresIniciales(tx, c.id, c.tipoTitular);
 *   });
 *
 * Idempotente: si los actores ya existen (ej. por re-creación tras
 * falla), las inserciones duplicadas son rechazadas por el índice
 * único (contractId, tipo, orden) y se ignoran silenciosamente.
 */

import type { ClientType, Prisma } from '@prisma/client';
import { actoresFijosParaTitular, etiquetaActor } from './expedienteCatalogs';

/**
 * Tipo del cliente Prisma compatible con `prisma.$transaction(async (tx) => ...)`.
 * Aceptamos cualquier objeto con el método `expedienteActor.create` para
 * permitir tanto el cliente raíz como el TransactionClient.
 */
type ExpedienteWriter = {
  expedienteActor: {
    create: (args: Prisma.ExpedienteActorCreateArgs) => Promise<unknown>;
  };
};

/**
 * Siembra los actores fijos (OPERACION + SOLICITANTE + BIEN_ARRENDADO +
 * FORMALIZACION; PM agrega REPRESENTANTE_LEGAL + PRINCIPAL_ACCIONISTA).
 * No crea AVALes — esos los agrega el usuario manualmente.
 *
 * Si un actor ya existe (P2002 violation), lo ignora — la operación
 * es idempotente.
 */
export async function sembrarActoresIniciales(
  tx: ExpedienteWriter,
  contractId: string,
  tipoTitular: ClientType,
): Promise<void> {
  const fijos = actoresFijosParaTitular(tipoTitular);

  for (const { tipo, orden } of fijos) {
    try {
      await tx.expedienteActor.create({
        data: {
          contractId,
          tipo,
          orden,
          // Etiqueta por defecto — el usuario puede personalizar el
          // nombre cuando edita el actor (p.ej. nombre del Rep. Legal).
          nombre: etiquetaActor(tipo, orden, null),
        },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation → actor ya existe; ignorar.
      const code = (err as { code?: string } | null | undefined)?.code;
      if (code !== 'P2002') throw err;
    }
  }
}
