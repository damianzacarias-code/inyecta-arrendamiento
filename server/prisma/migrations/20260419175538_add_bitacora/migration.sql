-- CreateTable
CREATE TABLE "bitacora" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioEmail" TEXT,
    "usuarioRol" TEXT,
    "metodo" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "accion" TEXT NOT NULL,
    "payloadJson" JSONB,
    "responseStatus" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bitacora_usuarioId_idx" ON "bitacora"("usuarioId");

-- CreateIndex
CREATE INDEX "bitacora_entidad_entidadId_idx" ON "bitacora"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "bitacora_createdAt_idx" ON "bitacora"("createdAt");
