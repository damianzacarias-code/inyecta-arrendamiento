-- Renombra el flag "valorResidualEsComision" → "valorResidualEsDeposito"
-- en quotations y contracts.
-- Causa: la regla de negocio real (per Damián, 27-04-2026) es que cuando
-- se marca el checkbox del cotizador, el valor residual = depósito en
-- garantía (el cliente pierde el depósito a cambio del bien). El nombre
-- legacy "EsComision" reflejaba una interpretación incorrecta.
--
-- RENAME COLUMN preserva los datos existentes (los registros con `true`
-- siguen siendo `true`, sólo cambia la semántica del cálculo upstream).
ALTER TABLE "quotations" RENAME COLUMN "valorResidualEsComision" TO "valorResidualEsDeposito";
ALTER TABLE "contracts"  RENAME COLUMN "valorResidualEsComision" TO "valorResidualEsDeposito";
