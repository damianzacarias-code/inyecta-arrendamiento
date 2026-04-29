-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "gpsProveedor" TEXT;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "gpsProveedor" TEXT;

-- CreateTable
CREATE TABLE "gps_proveedores" (
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio24m" DECIMAL(12,2) NOT NULL,
    "precio36m" DECIMAL(12,2) NOT NULL,
    "precio48m" DECIMAL(12,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "gps_proveedores_pkey" PRIMARY KEY ("clave")
);

-- Seed inicial: GBR + Tecno Logistic con los 6 precios de la tabla
-- entregada por Damián (28-04-2026). Idempotente vía ON CONFLICT —
-- en deployments donde la tabla ya esté sembrada (admin la editó),
-- no sobrescribe.
INSERT INTO "gps_proveedores"
  ("clave", "nombre", "descripcion", "precio24m", "precio36m", "precio48m", "orden", "activo", "updatedAt")
VALUES
  ('GBR',            'GBR',            'GPS sencillo',                       6380.00,  7820.00,  9260.00, 1, true, NOW()),
  ('TECNO_LOGISTIC', 'Tecno Logistic', 'GPS + tracker de mantenimiento',     8800.00, 12400.00, 16000.00, 2, true, NOW())
ON CONFLICT ("clave") DO NOTHING;
