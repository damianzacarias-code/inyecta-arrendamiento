-- Conciliación Bancaria: estados de cuenta y transacciones para matching contra Payments

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "cuenta" TEXT,
    "fileName" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "totalAbonos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCargos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "referencia" TEXT,
    "monto" DECIMAL(65,30) NOT NULL,
    "tipo" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "matchScore" INTEGER,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_transactions_statementId_idx" ON "bank_transactions"("statementId");
CREATE INDEX "bank_transactions_matched_idx" ON "bank_transactions"("matched");

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statementId_fkey"
  FOREIGN KEY ("statementId") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
