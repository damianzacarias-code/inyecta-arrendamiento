-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DIRECTOR', 'ANALISTA', 'COBRANZA', 'OPERACIONES');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PFAE', 'PM');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDIENTE', 'RECIBIDO', 'VENCIDO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "LeaseType" AS ENUM ('PURO', 'FINANCIERO');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('VIGENTE', 'VENCIDA', 'APROBADA', 'RECHAZADA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "ContractStage" AS ENUM ('SOLICITUD', 'ANALISIS_CLIENTE', 'ANALISIS_BIEN', 'COMITE', 'FORMALIZACION', 'DESEMBOLSO', 'ACTIVO');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('EN_PROCESO', 'VIGENTE', 'VENCIDO', 'TERMINADO', 'RESCINDIDO', 'REESTRUCTURADO');

-- CreateEnum
CREATE TYPE "EndOption" AS ENUM ('DEVOLUCION', 'RENOVACION', 'RESCATE', 'OPCION_COMPRA');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('RENTA_ORDINARIA', 'RENTA_ADELANTADA', 'ABONO_CAPITAL', 'LIQUIDACION_ANTICIPADA', 'MORATORIO', 'RENTA_EXTRAORDINARIA', 'ENGANCHE', 'DEPOSITO_GARANTIA', 'COMISION_APERTURA', 'SEGURO', 'GPS', 'OTRO');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVO', 'CORRECTIVO', 'REVISION_ANUAL', 'REVISION_ATRASO', 'SINIESTRO');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'COBRANZA', 'COMITE', 'LEGAL', 'MANTENIMIENTO', 'ALERTA');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "rol" "UserRole" NOT NULL DEFAULT 'ANALISTA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "tipo" "ClientType" NOT NULL,
    "nombre" TEXT,
    "apellidoPaterno" TEXT,
    "apellidoMaterno" TEXT,
    "curp" TEXT,
    "razonSocial" TEXT,
    "rfc" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "calle" TEXT,
    "numExterior" TEXT,
    "numInterior" TEXT,
    "colonia" TEXT,
    "municipio" TEXT,
    "ciudad" TEXT,
    "estado" TEXT,
    "cp" TEXT,
    "calleOp" TEXT,
    "numExteriorOp" TEXT,
    "numInteriorOp" TEXT,
    "coloniaOp" TEXT,
    "municipioOp" TEXT,
    "ciudadOp" TEXT,
    "estadoOp" TEXT,
    "cpOp" TEXT,
    "actaConstitutiva" TEXT,
    "registroPublico" TEXT,
    "representanteLegal" TEXT,
    "sector" TEXT,
    "actividadEconomica" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "requerido" BOOLEAN NOT NULL DEFAULT true,
    "estado" "DocumentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "archivoUrl" TEXT,
    "fechaRecepcion" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantors" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "rfc" TEXT,
    "curp" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "domicilio" TEXT,
    "relacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guarantors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantor_documents" (
    "id" TEXT NOT NULL,
    "guarantorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" "DocumentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "archivoUrl" TEXT,
    "fechaRecepcion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guarantor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholders" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "rfc" TEXT,
    "porcentaje" DECIMAL(65,30) NOT NULL,
    "esRepLegal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shareholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "productos" TEXT,
    "tipoSeguro" TEXT,
    "requiereGPS" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "clientId" TEXT,
    "nombreCliente" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "bienDescripcion" TEXT,
    "bienMarca" TEXT,
    "bienModelo" TEXT,
    "bienAnio" INTEGER,
    "bienNuevo" BOOLEAN NOT NULL DEFAULT true,
    "bienNumSerie" TEXT,
    "producto" "LeaseType" NOT NULL,
    "valorBien" DECIMAL(65,30) NOT NULL,
    "valorBienIVA" DECIMAL(65,30),
    "plazo" INTEGER NOT NULL,
    "tasaAnual" DECIMAL(65,30) NOT NULL,
    "nivelRiesgo" "RiskLevel" NOT NULL DEFAULT 'A',
    "enganche" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "enganchePorcentaje" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "depositoGarantia" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "depositoGarantiaPct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "comisionApertura" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "comisionAperturaPct" DECIMAL(65,30) NOT NULL DEFAULT 0.05,
    "comisionAperturaFinanciada" BOOLEAN NOT NULL DEFAULT true,
    "rentaInicial" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gpsInstalacion" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gpsFinanciado" BOOLEAN NOT NULL DEFAULT true,
    "seguroAnual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "seguroFinanciado" BOOLEAN NOT NULL DEFAULT true,
    "valorResidual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valorResidualPct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoFinanciar" DECIMAL(65,30),
    "rentaMensual" DECIMAL(65,30),
    "rentaMensualIVA" DECIMAL(65,30),
    "totalRentas" DECIMAL(65,30),
    "totalPagar" DECIMAL(65,30),
    "ganancia" DECIMAL(65,30),
    "estado" "QuotationStatus" NOT NULL DEFAULT 'VIGENTE',
    "fechaCotizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenciaHasta" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_options" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "producto" "LeaseType" NOT NULL,
    "nivelRiesgo" "RiskLevel" NOT NULL,
    "enganche" DECIMAL(65,30) NOT NULL,
    "rentaInicial" DECIMAL(65,30) NOT NULL,
    "depositoGarantia" DECIMAL(65,30) NOT NULL,
    "rentaMensualIVA" DECIMAL(65,30) NOT NULL,
    "valorResidual" DECIMAL(65,30) NOT NULL,
    "totalPagar" DECIMAL(65,30) NOT NULL,
    "ganancia" DECIMAL(65,30) NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "quotation_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "quotationId" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "etapa" "ContractStage" NOT NULL DEFAULT 'SOLICITUD',
    "etapaFecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comiteResolucion" TEXT,
    "bienDescripcion" TEXT NOT NULL,
    "bienMarca" TEXT,
    "bienModelo" TEXT,
    "bienAnio" INTEGER,
    "bienNumSerie" TEXT,
    "bienEstado" TEXT,
    "proveedor" TEXT,
    "producto" "LeaseType" NOT NULL,
    "valorBien" DECIMAL(65,30) NOT NULL,
    "valorBienIVA" DECIMAL(65,30) NOT NULL,
    "plazo" INTEGER NOT NULL,
    "tasaAnual" DECIMAL(65,30) NOT NULL,
    "tasaMoratoria" DECIMAL(65,30),
    "nivelRiesgo" "RiskLevel" NOT NULL,
    "enganche" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "depositoGarantia" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "comisionApertura" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rentaInicial" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gpsInstalacion" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "seguroAnual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valorResidual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoFinanciar" DECIMAL(65,30) NOT NULL,
    "rentaMensual" DECIMAL(65,30) NOT NULL,
    "rentaMensualIVA" DECIMAL(65,30) NOT NULL,
    "fechaFirma" TIMESTAMP(3),
    "fechaInicio" TIMESTAMP(3),
    "fechaEntregaBien" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "fechaTerminacion" TIMESTAMP(3),
    "estatus" "ContractStatus" NOT NULL DEFAULT 'EN_PROCESO',
    "motivoTerminacion" TEXT,
    "opcionVencimiento" "EndOption",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_history" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "etapa" "ContractStage" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "usuarioId" TEXT,

    CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amortization_entries" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodo" INTEGER NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "saldoInicial" DECIMAL(65,30) NOT NULL,
    "intereses" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pagoCapital" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "renta" DECIMAL(65,30) NOT NULL,
    "iva" DECIMAL(65,30) NOT NULL,
    "seguro" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pagoTotal" DECIMAL(65,30) NOT NULL,
    "saldoFinal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "amortization_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT,
    "periodo" INTEGER,
    "tipo" "PaymentType" NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3),
    "montoRenta" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoIVA" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoSeguro" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoMoratorio" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoIVAMoratorio" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoCapitalExtra" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montoTotal" DECIMAL(65,30) NOT NULL,
    "diasAtraso" INTEGER NOT NULL DEFAULT 0,
    "referencia" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "aseguradora" TEXT,
    "numPoliza" TEXT,
    "tipoCobertura" TEXT,
    "montoAsegurado" DECIMAL(65,30),
    "primaAnual" DECIMAL(65,30),
    "fechaInicio" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "endosoPref" BOOLEAN NOT NULL DEFAULT true,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_devices" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "numSerie" TEXT,
    "proveedor" TEXT,
    "fechaInstalacion" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "costoInstalacion" DECIMAL(65,30) DEFAULT 0,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gps_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tipo" "MaintenanceType" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT,
    "taller" TEXT,
    "costo" DECIMAL(65,30) DEFAULT 0,
    "comprobanteUrl" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "contractId" TEXT,
    "clientId" TEXT,
    "userId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo" "NoteType" NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_rfc_key" ON "clients"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_nombre_key" ON "asset_categories"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_folio_key" ON "quotations"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_folio_key" ON "contracts"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_quotationId_key" ON "contracts"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "amortization_entries_contractId_periodo_key" ON "amortization_entries"("contractId", "periodo");

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantor_documents" ADD CONSTRAINT "guarantor_documents_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "guarantors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_options" ADD CONSTRAINT "quotation_options_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amortization_entries" ADD CONSTRAINT "amortization_entries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_devices" ADD CONSTRAINT "gps_devices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
