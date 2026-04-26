/**
 * Sincroniza folio_sequences con los máximos actuales de Contract,
 * Quotation e Invoice. Idempotente — se puede correr múltiples veces.
 *
 * Necesario una sola vez al introducir el sistema de secuencias atómicas
 * (services/folioSequence.ts) cuando ya existen contratos/cotizaciones
 * creados con el patrón viejo `count + 1`. Sin esto, la primera llamada
 * a nextContractFolio() devolvería 1, colisionando con ARR-001-2026 que
 * ya existe.
 *
 * Uso:
 *   npx tsx src/scripts/backfillFolioSequences.ts
 */
import prisma from '../config/db';
import { backfillSequenceFromMax } from '../services/folioSequence';

function parseContractFolio(folio: string): { numero: number; year: number } | null {
  // Formato: ARR-NNN-YYYY (ej. ARR-001-2026)
  const m = folio.match(/^ARR-(\d+)-(\d{4})$/);
  if (!m) return null;
  return { numero: parseInt(m[1], 10), year: parseInt(m[2], 10) };
}

function parseQuotationFolio(folio: string): number | null {
  // Formato: COT-NNNN (ej. COT-0042)
  const m = folio.match(/^COT-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  console.log('▶ Backfill folio_sequences...');

  // ─── Contratos: agrupar por año ───
  const contracts = await prisma.contract.findMany({ select: { folio: true } });
  const contractMaxByYear = new Map<number, number>();
  for (const { folio } of contracts) {
    const parsed = parseContractFolio(folio);
    if (!parsed) continue;
    const cur = contractMaxByYear.get(parsed.year) || 0;
    if (parsed.numero > cur) contractMaxByYear.set(parsed.year, parsed.numero);
  }
  for (const [year, max] of contractMaxByYear) {
    await backfillSequenceFromMax(prisma, 'CONTRACT', year, max);
    console.log(`  CONTRACT  ${year}: max ${max}`);
  }
  if (contractMaxByYear.size === 0) console.log('  CONTRACT  (no hay folios previos)');

  // ─── Cotizaciones: serie continua, year=0 ───
  const quotations = await prisma.quotation.findMany({ select: { folio: true } });
  let quotationMax = 0;
  for (const { folio } of quotations) {
    const n = parseQuotationFolio(folio);
    if (n && n > quotationMax) quotationMax = n;
  }
  if (quotationMax > 0) {
    await backfillSequenceFromMax(prisma, 'QUOTATION', 0, quotationMax);
    console.log(`  QUOTATION   : max ${quotationMax}`);
  } else {
    console.log('  QUOTATION   : (no hay folios previos)');
  }

  // ─── Invoices: agrupar por serie SAT ───
  const invoiceMaxBySerie = await prisma.invoice.groupBy({
    by: ['serie'],
    _max: { folio: true },
  });
  for (const row of invoiceMaxBySerie) {
    if (!row._max.folio) continue;
    await backfillSequenceFromMax(prisma, `INVOICE_${row.serie}`, 0, row._max.folio);
    console.log(`  INVOICE_${row.serie}: max ${row._max.folio}`);
  }
  if (invoiceMaxBySerie.length === 0) console.log('  INVOICE     : (no hay folios previos)');

  console.log('✓ Backfill completo.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('✗ Backfill error:', err);
  process.exit(1);
});
