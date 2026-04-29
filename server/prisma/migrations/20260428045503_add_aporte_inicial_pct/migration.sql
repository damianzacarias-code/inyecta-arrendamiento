-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "aporteInicialPct" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "aporteInicialPct" DECIMAL(65,30) NOT NULL DEFAULT 0;
