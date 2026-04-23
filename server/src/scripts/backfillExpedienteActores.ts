/**
 * backfillExpedienteActores.ts
 * ─────────────────────────────────────────────────────────────────
 * Siembra los actores fijos del expediente para contratos creados
 * ANTES del refactor del expediente (cuando ExpedienteActor no
 * existía). Para cada contrato sin actores, llama al seeder usando
 * su tipoTitular.
 *
 * Idempotente: vuelve a correr sin efectos secundarios.
 *
 * Uso:
 *   cd server && npx tsx src/scripts/backfillExpedienteActores.ts
 */
import prisma from '../config/db';
import { sembrarActoresIniciales } from '../services/expedienteSeeder';

async function main() {
  // Contratos que NO tienen ningún actor en el expediente
  const contratos = await prisma.contract.findMany({
    where: { actores: { none: {} } },
    select: { id: true, folio: true, tipoTitular: true },
    orderBy: { fechaSolicitud: 'asc' },
  });

  if (contratos.length === 0) {
    console.log('✓ Sin contratos pendientes de backfill. Todo en orden.');
    return;
  }

  console.log(`Encontrados ${contratos.length} contrato(s) sin actores. Sembrando…\n`);

  for (const c of contratos) {
    try {
      await sembrarActoresIniciales(prisma, c.id, c.tipoTitular);
      const count = await prisma.expedienteActor.count({ where: { contractId: c.id } });
      console.log(`  ✓ ${c.folio} (${c.tipoTitular}) → ${count} actores creados`);
    } catch (err) {
      console.error(`  ✗ ${c.folio}: error`, err);
    }
  }

  console.log(`\nListo. Procesados ${contratos.length} contrato(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
