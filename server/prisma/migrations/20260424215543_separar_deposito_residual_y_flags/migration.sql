-- ============================================================
-- CLAUDE.md §4.13 / §4.14 — separar depósito de valor residual,
-- agregar flags de "residual = comisión" y "seguro pendiente".
-- ============================================================
--
-- IMPORTANTE: per decisión del owner (24-04-2026), las cotizaciones
-- existentes se borran porque las fórmulas anteriores difieren del
-- Excel canónico (no descontaban enganche, fusionaban depósito y
-- residual). Los contratos se preservan: solo se rompe el vínculo
-- contracts.quotationId → quotations.id (queda en NULL). Los
-- montos calculados ya están materializados en cada Contract.

-- 1. Romper el vínculo contracts.quotationId ANTES de borrar cotizaciones
--    para evitar violación de FK (la relación es RESTRICT por default).
UPDATE "contracts" SET "quotationId" = NULL WHERE "quotationId" IS NOT NULL;

-- 2. Borrar todas las cotizaciones. quotation_options cascade per schema.
DELETE FROM "quotations";

-- 3. Agregar nuevos flags al schema
-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "seguroPendiente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valorResidualEsComision" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "seguroPendiente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valorResidualEsComision" BOOLEAN NOT NULL DEFAULT false;
