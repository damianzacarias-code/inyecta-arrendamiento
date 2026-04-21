-- AlterTable
ALTER TABLE "bitacora" ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "bitacora_requestId_idx" ON "bitacora"("requestId");
