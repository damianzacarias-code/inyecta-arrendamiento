-- CreateEnum
CREATE TYPE "OperationDraftStatus" AS ENUM ('DRAFT', 'FINALIZED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "DraftActorRol" AS ENUM ('TITULAR', 'AVAL', 'REPRESENTANTE_LEGAL', 'SOCIO');

-- CreateTable
CREATE TABLE "operation_drafts" (
    "id" TEXT NOT NULL,
    "status" "OperationDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "tipoOperacion" "LeaseType",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedContractId" TEXT,

    CONSTRAINT "operation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_draft_actores" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "rol" "DraftActorRol" NOT NULL,
    "subtipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "datosConsolidados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_draft_actores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_draft_documents" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "actorId" TEXT,
    "tipoDocumento" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "archivoPath" TEXT NOT NULL,
    "extraccion" JSONB,
    "confianzaExtraccion" INTEGER,
    "extraidoEn" TIMESTAMP(3),
    "extraccionError" TEXT,
    "autoAsignado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_draft_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operation_drafts_finalizedContractId_key" ON "operation_drafts"("finalizedContractId");

-- CreateIndex
CREATE INDEX "operation_drafts_createdById_status_idx" ON "operation_drafts"("createdById", "status");

-- CreateIndex
CREATE INDEX "operation_draft_actores_draftId_idx" ON "operation_draft_actores"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "operation_draft_actores_draftId_rol_orden_key" ON "operation_draft_actores"("draftId", "rol", "orden");

-- CreateIndex
CREATE INDEX "operation_draft_documents_draftId_idx" ON "operation_draft_documents"("draftId");

-- CreateIndex
CREATE INDEX "operation_draft_documents_actorId_idx" ON "operation_draft_documents"("actorId");

-- AddForeignKey
ALTER TABLE "operation_drafts" ADD CONSTRAINT "operation_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_drafts" ADD CONSTRAINT "operation_drafts_finalizedContractId_fkey" FOREIGN KEY ("finalizedContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_draft_actores" ADD CONSTRAINT "operation_draft_actores_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "operation_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_draft_documents" ADD CONSTRAINT "operation_draft_documents_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "operation_draft_actores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
