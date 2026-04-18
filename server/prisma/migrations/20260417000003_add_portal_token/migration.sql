-- Portal del Arrendatario: token único por cliente para acceso autenticado a su info
ALTER TABLE "clients" ADD COLUMN "portalToken" TEXT;
ALTER TABLE "clients" ADD COLUMN "portalUltimoAcceso" TIMESTAMP(3);

-- CreateIndex (único, permite NULLs múltiples)
CREATE UNIQUE INDEX "clients_portalToken_key" ON "clients"("portalToken");
