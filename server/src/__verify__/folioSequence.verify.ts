/**
 * Verifica que folioSequence es realmente atómico bajo concurrencia.
 *
 * El test viejo `count + 1` falla este verify (dos requests obtienen
 * el mismo número). El nuevo nextFolio() debe asignar 50 folios únicos
 * cuando se piden 50 en paralelo.
 *
 * Correr cuando se cambie folioSequence.ts:
 *   npx tsx src/__verify__/folioSequence.verify.ts
 */
import prisma from '../config/db';
import { nextFolio } from '../services/folioSequence';

async function main() {
  const SCOPE = 'VERIFY_RACE';
  const YEAR  = 1970;
  const N     = 50;

  // Limpieza previa
  await prisma.folioSequence.deleteMany({ where: { scope: SCOPE } });

  // 50 incrementos en paralelo. Si hay race condition, veremos < 50
  // valores únicos o un valor máximo distinto a 50.
  const promesas = Array.from({ length: N }, () =>
    prisma.$transaction((tx) => nextFolio(tx, SCOPE, YEAR)),
  );
  const valores = await Promise.all(promesas);

  const unicos = new Set(valores);
  const max = Math.max(...valores);
  const min = Math.min(...valores);

  const ok = unicos.size === N && max === N && min === 1;

  console.log(`folioSequence concurrency test:`);
  console.log(`  pedidos:   ${N}`);
  console.log(`  únicos:    ${unicos.size}`);
  console.log(`  rango:     [${min}, ${max}]`);
  console.log(`  resultado: ${ok ? '✅ OK' : '❌ FALLÓ'}`);

  // Cleanup
  await prisma.folioSequence.deleteMany({ where: { scope: SCOPE } });
  await prisma.$disconnect();

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('verify error:', err);
  process.exit(1);
});
