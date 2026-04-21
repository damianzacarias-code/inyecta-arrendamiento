-- CreateEnum
CREATE TYPE "EstadoCivil" AS ENUM ('SOLTERO', 'CASADO');

-- CreateEnum
CREATE TYPE "RegimenMatrimonial" AS ENUM ('SEPARACION_BIENES', 'SOCIEDAD_CONYUGAL');

-- CreateEnum
CREATE TYPE "SituacionInstalaciones" AS ENUM ('PROPIAS', 'RENTADAS', 'PAGANDOSE', 'FAMILIARES', 'COMODATO', 'HIPOTECADAS');

-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('M', 'F', 'OTRO', 'NO_ESPECIFICA');

-- CreateEnum
CREATE TYPE "MontoRango" AS ENUM ('HASTA_50K', 'ENTRE_50K_100K', 'MAS_100K');

-- CreateEnum
CREATE TYPE "FrecuenciaTrans" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "NumOpsRango" AS ENUM ('UNO_A_TREINTA', 'TREINTAIUNO_A_CINCUENTA', 'MAS_DE_CINCUENTA');

-- CreateEnum
CREATE TYPE "PepTipo" AS ENUM ('SOLICITANTE', 'PARIENTE', 'SOCIO_ACCIONISTA');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "anosAntiguedadActividad" INTEGER,
ADD COLUMN     "capitalSocial" DECIMAL(65,30),
ADD COLUMN     "fechaConstitucion" TIMESTAMP(3),
ADD COLUMN     "fechaInscripcionRPC" TIMESTAMP(3),
ADD COLUMN     "fiel" TEXT,
ADD COLUMN     "folioMercantil" TEXT,
ADD COLUMN     "pais" TEXT DEFAULT 'México',
ADD COLUMN     "regimenFiscal" TEXT,
ADD COLUMN     "registroIMSS" TEXT,
ADD COLUMN     "telefonoOficina" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "destinoArrendamiento" TEXT,
ADD COLUMN     "fechaSolicitud" TIMESTAMP(3),
ADD COLUMN     "lugarSolicitud" TEXT,
ADD COLUMN     "montoSolicitado" DECIMAL(65,30),
ADD COLUMN     "promotor" TEXT,
ADD COLUMN     "tercerAportanteExiste" BOOLEAN,
ADD COLUMN     "tercerAportanteInfo" TEXT,
ADD COLUMN     "tercerBeneficiarioExiste" BOOLEAN,
ADD COLUMN     "tercerBeneficiarioInfo" TEXT;

-- AlterTable
ALTER TABLE "guarantors" ADD COLUMN     "calle" TEXT,
ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "colonia" TEXT,
ADD COLUMN     "cp" TEXT,
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "estadoCivil" "EstadoCivil",
ADD COLUMN     "fechaInscripcionEscrituraConst" TIMESTAMP(3),
ADD COLUMN     "fechaInscripcionPoderes" TIMESTAMP(3),
ADD COLUMN     "fechaNacimiento" TIMESTAMP(3),
ADD COLUMN     "fiel" TEXT,
ADD COLUMN     "folioInscripcionEscrituraConst" TEXT,
ADD COLUMN     "folioInscripcionPoderes" TEXT,
ADD COLUMN     "genero" "Genero",
ADD COLUMN     "lugarNacimiento" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "nacionalidad" TEXT,
ADD COLUMN     "nombreConyuge" TEXT,
ADD COLUMN     "numExterior" TEXT,
ADD COLUMN     "numInterior" TEXT,
ADD COLUMN     "pais" TEXT DEFAULT 'México',
ADD COLUMN     "razonSocial" TEXT,
ADD COLUMN     "regimenMatrimonial" "RegimenMatrimonial",
ADD COLUMN     "representanteApellidoMaterno" TEXT,
ADD COLUMN     "representanteApellidoPaterno" TEXT,
ADD COLUMN     "representanteNombre" TEXT,
ADD COLUMN     "representanteRfc" TEXT,
ADD COLUMN     "telefonoCelular" TEXT,
ADD COLUMN     "telefonoFijo" TEXT;

-- AlterTable
ALTER TABLE "shareholders" ADD COLUMN     "anosExperiencia" INTEGER,
ADD COLUMN     "calle" TEXT,
ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "colonia" TEXT,
ADD COLUMN     "cp" TEXT,
ADD COLUMN     "curp" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "estadoCivil" "EstadoCivil",
ADD COLUMN     "fechaInscripcionEscrituraConst" TIMESTAMP(3),
ADD COLUMN     "fechaNacimiento" TIMESTAMP(3),
ADD COLUMN     "fiel" TEXT,
ADD COLUMN     "folioInscripcionEscrituraConst" TEXT,
ADD COLUMN     "genero" "Genero",
ADD COLUMN     "lugarNacimiento" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "nacionalidad" TEXT,
ADD COLUMN     "nombreConyuge" TEXT,
ADD COLUMN     "numExterior" TEXT,
ADD COLUMN     "numInterior" TEXT,
ADD COLUMN     "pais" TEXT DEFAULT 'México',
ADD COLUMN     "razonSocial" TEXT,
ADD COLUMN     "regimenMatrimonial" "RegimenMatrimonial",
ADD COLUMN     "situacionInstalaciones" "SituacionInstalaciones",
ADD COLUMN     "telefonoCelular" TEXT,
ADD COLUMN     "telefonoFijo" TEXT,
ADD COLUMN     "tiempoResidenciaAnos" INTEGER;

-- CreateTable
CREATE TABLE "representantes_legales" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "rfc" TEXT,
    "curp" TEXT,
    "fiel" TEXT,
    "genero" "Genero",
    "ocupacion" TEXT,
    "anosExperiencia" INTEGER,
    "fechaNacimiento" TIMESTAMP(3),
    "lugarNacimiento" TEXT,
    "nacionalidad" TEXT,
    "estadoCivil" "EstadoCivil",
    "regimenMatrimonial" "RegimenMatrimonial",
    "nombreConyuge" TEXT,
    "calle" TEXT,
    "numExterior" TEXT,
    "numInterior" TEXT,
    "colonia" TEXT,
    "municipio" TEXT,
    "ciudad" TEXT,
    "estado" TEXT,
    "pais" TEXT DEFAULT 'México',
    "cp" TEXT,
    "situacionInstalaciones" "SituacionInstalaciones",
    "tiempoResidenciaAnos" INTEGER,
    "telefonoFijo" TEXT,
    "telefonoCelular" TEXT,
    "email" TEXT,
    "fechaInscripcionPoderes" TIMESTAMP(3),
    "folioInscripcionPoderes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "representantes_legales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_guarantors" (
    "contractId" TEXT NOT NULL,
    "guarantorId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_guarantors_pkey" PRIMARY KEY ("contractId","guarantorId")
);

-- CreateTable
CREATE TABLE "perfil_transaccional" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "productosQueAdquirira" TEXT,
    "origenRecursos" TEXT,
    "destinoRecursos" TEXT,
    "montoMensualRango" "MontoRango",
    "frecuencia" "FrecuenciaTrans",
    "numOperacionesRango" "NumOpsRango",
    "realizaPagosEfectivo" BOOLEAN,
    "efectivoMotivos" TEXT,
    "efectivoMontoMensual" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfil_transaccional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreContacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaraciones_pep" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tipo" "PepTipo" NOT NULL,
    "esPep" BOOLEAN NOT NULL,
    "nombre" TEXT,
    "parentesco" TEXT,
    "dependencia" TEXT,
    "puesto" TEXT,
    "periodoEjercicio" TEXT,
    "principalesFunciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declaraciones_pep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "representantes_legales_clientId_key" ON "representantes_legales"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_guarantors_contractId_orden_key" ON "contract_guarantors"("contractId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_transaccional_contractId_key" ON "perfil_transaccional"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_contractId_key" ON "proveedores"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "declaraciones_pep_contractId_tipo_key" ON "declaraciones_pep"("contractId", "tipo");

-- AddForeignKey
ALTER TABLE "representantes_legales" ADD CONSTRAINT "representantes_legales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_guarantors" ADD CONSTRAINT "contract_guarantors_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_guarantors" ADD CONSTRAINT "contract_guarantors_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "guarantors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_transaccional" ADD CONSTRAINT "perfil_transaccional_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaraciones_pep" ADD CONSTRAINT "declaraciones_pep_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
