-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('INGRESO', 'EGRESO', 'PAGO');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('BORRADOR', 'TIMBRADO', 'CANCELADO', 'ERROR');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "contractId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" "InvoiceType" NOT NULL DEFAULT 'INGRESO',
    "serie" TEXT NOT NULL DEFAULT 'A',
    "folio" INTEGER NOT NULL,
    "uuid" TEXT,
    "fechaTimbrado" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(65,30) NOT NULL,
    "iva" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retenciones" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "rfcReceptor" TEXT NOT NULL,
    "nombreReceptor" TEXT NOT NULL,
    "usoCfdi" TEXT NOT NULL DEFAULT 'G03',
    "metodoPago" TEXT NOT NULL DEFAULT 'PUE',
    "formaPago" TEXT NOT NULL DEFAULT '03',
    "regimenFiscal" TEXT NOT NULL DEFAULT '601',
    "xmlUrl" TEXT,
    "pdfUrl" TEXT,
    "motivoCancelacion" TEXT,
    "fechaCancelacion" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_paymentId_key" ON "invoices"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_uuid_key" ON "invoices"("uuid");

-- CreateIndex
CREATE INDEX "invoices_contractId_idx" ON "invoices"("contractId");

-- CreateIndex
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
