-- AlterTable
ALTER TABLE "catalog" ADD COLUMN     "folioCondusefFin" TEXT,
ADD COLUMN     "folioCondusefPuro" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "notarioConstLugar" TEXT,
ADD COLUMN     "notarioConstNombre" TEXT,
ADD COLUMN     "notarioConstNumero" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "bienColor" TEXT,
ADD COLUMN     "bienMotor" TEXT,
ADD COLUMN     "bienNIV" TEXT,
ADD COLUMN     "bienPlacas" TEXT,
ADD COLUMN     "diaPagoMensual" INTEGER,
ADD COLUMN     "lugarEntregaBien" TEXT;

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "banco" TEXT,
ADD COLUMN     "calle" TEXT,
ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "clabe" TEXT,
ADD COLUMN     "colonia" TEXT,
ADD COLUMN     "cp" TEXT,
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "numCuenta" TEXT,
ADD COLUMN     "numExterior" TEXT,
ADD COLUMN     "numInterior" TEXT,
ADD COLUMN     "pais" TEXT DEFAULT 'México',
ADD COLUMN     "rfc" TEXT;

-- AlterTable
ALTER TABLE "representantes_legales" ADD COLUMN     "poderEscrituraFecha" TIMESTAMP(3),
ADD COLUMN     "poderEscrituraNumero" TEXT,
ADD COLUMN     "poderNotarioLugar" TEXT,
ADD COLUMN     "poderNotarioNombre" TEXT,
ADD COLUMN     "poderNotarioNumero" TEXT;

-- CreateTable
CREATE TABLE "avales" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 1,
    "tipo" "ClientType" NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT,
    "apellidoMaterno" TEXT,
    "rfc" TEXT,
    "curp" TEXT,
    "fiel" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "lugarNacimiento" TEXT,
    "nacionalidad" TEXT DEFAULT 'Mexicana',
    "estadoCivil" "EstadoCivil",
    "regimenMatrimonial" "RegimenMatrimonial",
    "nombreConyuge" TEXT,
    "rfcConyuge" TEXT,
    "calle" TEXT,
    "numExterior" TEXT,
    "numInterior" TEXT,
    "colonia" TEXT,
    "municipio" TEXT,
    "ciudad" TEXT,
    "estado" TEXT,
    "pais" TEXT DEFAULT 'México',
    "cp" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "razonSocial" TEXT,
    "fechaConstitucion" TIMESTAMP(3),
    "folioMercantil" TEXT,
    "notarioConstNombre" TEXT,
    "notarioConstNumero" TEXT,
    "notarioConstLugar" TEXT,
    "repLegalNombre" TEXT,
    "repLegalRfc" TEXT,
    "poderEscrituraNumero" TEXT,
    "poderEscrituraFecha" TIMESTAMP(3),
    "poderNotarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagares" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "numeroPagare" TEXT NOT NULL,
    "fechaSuscripcion" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "montoPagare" DECIMAL(65,30) NOT NULL,
    "lugarSuscripcion" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avales_contractId_idx" ON "avales"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "avales_contractId_orden_key" ON "avales"("contractId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "pagares_contractId_key" ON "pagares"("contractId");

-- AddForeignKey
ALTER TABLE "avales" ADD CONSTRAINT "avales_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagares" ADD CONSTRAINT "pagares_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
