-- ============================================================
-- Migración: Expediente por actor
-- ------------------------------------------------------------
-- Reemplaza por completo la estructura de documentos por una
-- estructura por ACTORES del expediente, basada en los
-- checklists oficiales de Inyecta (PFAE/PM).
--
-- Cambios:
--  - DROP: client_documents, contract_documents, contract_guarantors,
--          guarantor_documents, guarantors (datos eran de prueba)
--  - DROP: enum DocumentStatus
--  - ADD : enum ActorTipo, ActorSubtipo, DocumentoEstatus
--  - ADD : tabla expediente_actores, expediente_documentos
--  - ALTER contracts: agrega columna `tipoTitular` (NOT NULL,
--          backfilleada desde clients.tipo)
-- ============================================================

-- 1. Drop foreign keys de las tablas a eliminar
ALTER TABLE "client_documents"      DROP CONSTRAINT IF EXISTS "client_documents_clientId_fkey";
ALTER TABLE "contract_documents"    DROP CONSTRAINT IF EXISTS "contract_documents_contractId_fkey";
ALTER TABLE "contract_documents"    DROP CONSTRAINT IF EXISTS "contract_documents_uploadedBy_fkey";
ALTER TABLE "contract_guarantors"   DROP CONSTRAINT IF EXISTS "contract_guarantors_contractId_fkey";
ALTER TABLE "contract_guarantors"   DROP CONSTRAINT IF EXISTS "contract_guarantors_guarantorId_fkey";
ALTER TABLE "guarantor_documents"   DROP CONSTRAINT IF EXISTS "guarantor_documents_guarantorId_fkey";
ALTER TABLE "guarantors"            DROP CONSTRAINT IF EXISTS "guarantors_clientId_fkey";

-- 2. Drop tablas legacy
DROP TABLE IF EXISTS "client_documents";
DROP TABLE IF EXISTS "contract_documents";
DROP TABLE IF EXISTS "contract_guarantors";
DROP TABLE IF EXISTS "guarantor_documents";
DROP TABLE IF EXISTS "guarantors";

-- 3. Drop enum legacy
DROP TYPE IF EXISTS "DocumentStatus";

-- 4. Crear nuevos enums
CREATE TYPE "ActorTipo" AS ENUM (
  'OPERACION',
  'SOLICITANTE',
  'REPRESENTANTE_LEGAL',
  'PRINCIPAL_ACCIONISTA',
  'AVAL',
  'BIEN_ARRENDADO',
  'FORMALIZACION'
);

CREATE TYPE "ActorSubtipo" AS ENUM ('PF', 'PM');

CREATE TYPE "DocumentoEstatus" AS ENUM ('PENDIENTE', 'VALIDADO', 'RECHAZADO');

-- 5. Agregar tipoTitular a contracts (en dos pasos para backfillear)
ALTER TABLE "contracts" ADD COLUMN "tipoTitular" "ClientType";

-- Backfill: copia el ClientType del cliente asociado a cada contrato.
-- Esto preserva la coherencia de los 11 contratos existentes sin
-- requerir intervención manual.
UPDATE "contracts" c
SET "tipoTitular" = cl."tipo"
FROM "clients" cl
WHERE cl."id" = c."clientId";

-- Una vez backfilleado, lo hacemos NOT NULL.
ALTER TABLE "contracts" ALTER COLUMN "tipoTitular" SET NOT NULL;

-- 6. Crear tabla expediente_actores
CREATE TABLE "expediente_actores" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tipo" "ActorTipo" NOT NULL,
    "subtipo" "ActorSubtipo",
    "orden" INTEGER NOT NULL DEFAULT 1,
    "nombre" TEXT,
    "rfc" TEXT,
    "datosAdicionales" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expediente_actores_pkey" PRIMARY KEY ("id")
);

-- Unicidad: un solo actor de cada tipo+orden por contrato.
-- Para actores fijos (orden=1) implica único por contrato.
-- Para AVAL, distintos `orden` permiten Aval 1, Aval 2, etc.
CREATE UNIQUE INDEX "expediente_actores_contractId_tipo_orden_key"
  ON "expediente_actores"("contractId", "tipo", "orden");

CREATE INDEX "expediente_actores_contractId_idx"
  ON "expediente_actores"("contractId");

ALTER TABLE "expediente_actores"
  ADD CONSTRAINT "expediente_actores_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "contracts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Crear tabla expediente_documentos
CREATE TABLE "expediente_documentos" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "tipoDocumento" TEXT,
    "nombreArchivo" TEXT NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "tieneFisico" BOOLEAN NOT NULL DEFAULT false,
    "tieneDigital" BOOLEAN NOT NULL DEFAULT true,
    "estatus" "DocumentoEstatus" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "fechaSubida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subidoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expediente_documentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expediente_documentos_actorId_idx"
  ON "expediente_documentos"("actorId");

CREATE INDEX "expediente_documentos_actorId_tipoDocumento_idx"
  ON "expediente_documentos"("actorId", "tipoDocumento");

ALTER TABLE "expediente_documentos"
  ADD CONSTRAINT "expediente_documentos_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "expediente_actores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expediente_documentos"
  ADD CONSTRAINT "expediente_documentos_subidoPor_fkey"
  FOREIGN KEY ("subidoPor") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
