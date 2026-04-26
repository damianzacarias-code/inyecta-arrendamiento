-- CreateTable
CREATE TABLE "catalog" (
    "clave" TEXT NOT NULL,
    "tasaAnualDefault" DECIMAL(7,4) NOT NULL,
    "tasaAnualMin" DECIMAL(7,4) NOT NULL,
    "tasaAnualMax" DECIMAL(7,4) NOT NULL,
    "comisionAperturaDefault" DECIMAL(7,4) NOT NULL,
    "comisionAperturaMin" DECIMAL(7,4) NOT NULL,
    "comisionAperturaMax" DECIMAL(7,4) NOT NULL,
    "gpsMontoDefault" DECIMAL(12,2) NOT NULL,
    "gpsFinanciableDefault" BOOLEAN NOT NULL DEFAULT true,
    "tasaMoratoriaMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "catalog_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "risk_presets" (
    "nivel" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "engachePuroPct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "depositoPuroPct" DECIMAL(7,4) NOT NULL,
    "engancheFinPct" DECIMAL(7,4) NOT NULL,
    "depositoFinPct" DECIMAL(7,4) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "risk_presets_pkey" PRIMARY KEY ("nivel")
);

-- Seed con los valores históricos hardcoded. La fila Catalog 'default'
-- y los 3 niveles A/B/C son los datos que el cotizador y los presets de
-- riesgo usaban antes de existir esta tabla. Idempotente vía ON CONFLICT
-- para que correr la migración dos veces no duplique ni machaque ediciones.
INSERT INTO "catalog" (
    "clave",
    "tasaAnualDefault", "tasaAnualMin", "tasaAnualMax",
    "comisionAperturaDefault", "comisionAperturaMin", "comisionAperturaMax",
    "gpsMontoDefault", "gpsFinanciableDefault",
    "tasaMoratoriaMultiplier",
    "updatedAt"
) VALUES (
    'default',
    0.36, 0.18, 0.60,
    0.05, 0.00, 0.10,
    16000, true,
    2.0,
    NOW()
) ON CONFLICT ("clave") DO NOTHING;

INSERT INTO "risk_presets" (
    "nivel", "nombre",
    "engachePuroPct", "depositoPuroPct",
    "engancheFinPct", "depositoFinPct",
    "orden", "updatedAt"
) VALUES
    ('A', 'Riesgo bajo',  0, 0.16, 0.00, 0.16, 1, NOW()),
    ('B', 'Riesgo medio', 0, 0.21, 0.05, 0.16, 2, NOW()),
    ('C', 'Riesgo alto',  0, 0.26, 0.10, 0.16, 3, NOW())
ON CONFLICT ("nivel") DO NOTHING;
