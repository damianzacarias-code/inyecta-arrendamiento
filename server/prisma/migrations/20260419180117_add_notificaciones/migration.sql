-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'LEGAL';

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "url" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_userId_leida_idx" ON "notificaciones"("userId", "leida");

-- CreateIndex
CREATE INDEX "notificaciones_userId_createdAt_idx" ON "notificaciones"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notificaciones_entidad_entidadId_idx" ON "notificaciones"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
