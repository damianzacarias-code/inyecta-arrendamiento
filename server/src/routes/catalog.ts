/**
 * /api/config/catalog — Catálogo dinámico de tasas, comisiones, GPS
 * y presets de riesgo.
 * ----------------------------------------------------------------
 * GET  /api/config/catalog          → lectura pública (cualquier sesión
 *                                     autenticada lo puede leer; lo
 *                                     consume el cotizador para defaults).
 * PUT  /api/config/catalog          → ADMIN/DIRECTOR — edita la fila
 *                                     'default' del catálogo.
 * PUT  /api/config/catalog/risk/:nivel → ADMIN/DIRECTOR — edita un preset.
 *
 * Por qué con auth (a diferencia de /branding que es público):
 *   El branding son datos legales del emisor (razón social, CLABE) que
 *   ya van impresos en cotizaciones. El catálogo en cambio es política
 *   comercial (qué tasa cobra la casa hoy) y no hay razón de exponerlo
 *   sin sesión. Lo lee el cotizador después de login.
 *
 * El llamador SIEMPRE recibe valores válidos:
 *   • Si por alguna razón faltan filas (BD recién migrada sin seed),
 *     devolvemos defaults históricos en memoria — el cotizador nunca
 *     ve un 404 ni un null.
 */
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import type { Request } from 'express';
import { childLogger } from '../lib/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const log = childLogger('catalog');

// ── Defaults históricos (fallback si BD vacía) ──────────────────────
// Espejan el seed de la migración. Existir como código garantiza que
// el cotizador funciona aunque alguien borre la fila por accidente.
const DEFAULT_CATALOG = {
  clave: 'default',
  tasaAnualDefault: '0.36',
  tasaAnualMin: '0.18',
  tasaAnualMax: '0.60',
  comisionAperturaDefault: '0.05',
  comisionAperturaMin: '0',
  comisionAperturaMax: '0.10',
  gpsMontoDefault: '16000',
  gpsFinanciableDefault: true,
  tasaMoratoriaMultiplier: '2',
} as const;

const DEFAULT_RISK_PRESETS = [
  { nivel: 'A', nombre: 'Riesgo bajo',  engachePuroPct: '0', depositoPuroPct: '0.16', engancheFinPct: '0',    depositoFinPct: '0.16', orden: 1 },
  { nivel: 'B', nombre: 'Riesgo medio', engachePuroPct: '0', depositoPuroPct: '0.21', engancheFinPct: '0.05', depositoFinPct: '0.16', orden: 2 },
  { nivel: 'C', nombre: 'Riesgo alto',  engachePuroPct: '0', depositoPuroPct: '0.26', engancheFinPct: '0.10', depositoFinPct: '0.16', orden: 3 },
] as const;

// ── Schemas Zod ─────────────────────────────────────────────────────
//
// Validamos rangos sensatos: tasas ∈ [0,1.5] (cubre tope legal AAR
// con margen), GPS ∈ [0, 1_000_000] (sería absurdo más). Multiplicador
// moratorio en [1, 5] (1 = sin penalty, 5 = brutal).
const catalogUpdateSchema = z
  .object({
    tasaAnualDefault:        z.coerce.number().min(0).max(1.5),
    tasaAnualMin:            z.coerce.number().min(0).max(1.5),
    tasaAnualMax:            z.coerce.number().min(0).max(1.5),
    comisionAperturaDefault: z.coerce.number().min(0).max(0.5),
    comisionAperturaMin:     z.coerce.number().min(0).max(0.5),
    comisionAperturaMax:     z.coerce.number().min(0).max(0.5),
    gpsMontoDefault:         z.coerce.number().min(0).max(1_000_000),
    gpsFinanciableDefault:   z.boolean(),
    tasaMoratoriaMultiplier: z.coerce.number().min(1).max(5),
    // Folios CONDUSEF — opcionales (null hasta que Damián registre las
    // plantillas en CONDUSEF). Sin formato fuerte porque varía por
    // entidad supervisora.
    folioCondusefPuro:       z.string().trim().max(60).optional().nullable(),
    folioCondusefFin:        z.string().trim().max(60).optional().nullable(),
  })
  .refine((d) => d.tasaAnualMin <= d.tasaAnualDefault && d.tasaAnualDefault <= d.tasaAnualMax, {
    message: 'tasaAnualMin ≤ tasaAnualDefault ≤ tasaAnualMax',
    path: ['tasaAnualDefault'],
  })
  .refine(
    (d) => d.comisionAperturaMin <= d.comisionAperturaDefault && d.comisionAperturaDefault <= d.comisionAperturaMax,
    {
      message: 'comisionAperturaMin ≤ comisionAperturaDefault ≤ comisionAperturaMax',
      path: ['comisionAperturaDefault'],
    },
  );

const riskPresetUpdateSchema = z.object({
  nombre:          z.string().min(1).max(80),
  engachePuroPct:  z.coerce.number().min(0).max(1),
  depositoPuroPct: z.coerce.number().min(0).max(1),
  engancheFinPct:  z.coerce.number().min(0).max(1),
  depositoFinPct:  z.coerce.number().min(0).max(1),
  orden:           z.coerce.number().int().min(0).max(99),
});

// ── Helpers de serialización ────────────────────────────────────────
//
// Decimal de Prisma se serializa por default como string. Para el
// cotizador es más cómodo recibirlo ya como número JS. Los valores son
// tasas y montos que caben sin problema en double.
function toNumber(d: Prisma.Decimal | string | number): number {
  if (typeof d === 'number') return d;
  if (typeof d === 'string') return Number(d);
  return d.toNumber();
}

function serializeCatalog(c: Awaited<ReturnType<typeof prisma.catalog.findUnique>>) {
  if (!c) {
    return {
      ...DEFAULT_CATALOG,
      tasaAnualDefault:        Number(DEFAULT_CATALOG.tasaAnualDefault),
      tasaAnualMin:            Number(DEFAULT_CATALOG.tasaAnualMin),
      tasaAnualMax:            Number(DEFAULT_CATALOG.tasaAnualMax),
      comisionAperturaDefault: Number(DEFAULT_CATALOG.comisionAperturaDefault),
      comisionAperturaMin:     Number(DEFAULT_CATALOG.comisionAperturaMin),
      comisionAperturaMax:     Number(DEFAULT_CATALOG.comisionAperturaMax),
      gpsMontoDefault:         Number(DEFAULT_CATALOG.gpsMontoDefault),
      tasaMoratoriaMultiplier: Number(DEFAULT_CATALOG.tasaMoratoriaMultiplier),
      _fallback: true as const,
    };
  }
  return {
    clave: c.clave,
    tasaAnualDefault:        toNumber(c.tasaAnualDefault),
    tasaAnualMin:            toNumber(c.tasaAnualMin),
    tasaAnualMax:            toNumber(c.tasaAnualMax),
    comisionAperturaDefault: toNumber(c.comisionAperturaDefault),
    comisionAperturaMin:     toNumber(c.comisionAperturaMin),
    comisionAperturaMax:     toNumber(c.comisionAperturaMax),
    gpsMontoDefault:         toNumber(c.gpsMontoDefault),
    gpsFinanciableDefault:   c.gpsFinanciableDefault,
    tasaMoratoriaMultiplier: toNumber(c.tasaMoratoriaMultiplier),
    // Folios CONDUSEF (uno por producto). null hasta que Damián los registre.
    folioCondusefPuro:       c.folioCondusefPuro ?? null,
    folioCondusefFin:        c.folioCondusefFin ?? null,
    updatedAt:               c.updatedAt.toISOString(),
    updatedById:             c.updatedById,
  };
}

function serializePresets(presets: Awaited<ReturnType<typeof prisma.riskPreset.findMany>>) {
  if (presets.length === 0) {
    return DEFAULT_RISK_PRESETS.map((p) => ({
      ...p,
      engachePuroPct:  Number(p.engachePuroPct),
      depositoPuroPct: Number(p.depositoPuroPct),
      engancheFinPct:  Number(p.engancheFinPct),
      depositoFinPct:  Number(p.depositoFinPct),
      _fallback: true as const,
    }));
  }
  return presets.map((p) => ({
    nivel: p.nivel,
    nombre: p.nombre,
    engachePuroPct:  toNumber(p.engachePuroPct),
    depositoPuroPct: toNumber(p.depositoPuroPct),
    engancheFinPct:  toNumber(p.engancheFinPct),
    depositoFinPct:  toNumber(p.depositoFinPct),
    orden: p.orden,
    updatedAt: p.updatedAt.toISOString(),
    updatedById: p.updatedById,
  }));
}

// ── Rutas ───────────────────────────────────────────────────────────

/**
 * GET /api/config/catalog
 *
 * Lectura combinada para que el cotizador haga 1 sólo round-trip al
 * boot, no 2. Cualquier sesión autenticada puede leer.
 */
router.get(
  '/catalog',
  requireAuth,
  asyncHandler(async (_req: Request, res) => {
    const [catalog, presets] = await Promise.all([
      prisma.catalog.findUnique({ where: { clave: 'default' } }),
      prisma.riskPreset.findMany({ orderBy: { orden: 'asc' } }),
    ]);
    res.json({
      catalog: serializeCatalog(catalog),
      riskPresets: serializePresets(presets),
    });
  }),
);

/**
 * PUT /api/config/catalog — ADMIN/DIRECTOR.
 *
 * Upsert para que un deployment fresco también pueda editar (aunque la
 * migración siembra la fila — defensa en profundidad).
 */
router.put(
  '/catalog',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  asyncHandler(async (req: Request, res) => {
    const data = catalogUpdateSchema.parse(req.body);
    const userId = req.user?.userId ?? null;

    const updated = await prisma.catalog.upsert({
      where: { clave: 'default' },
      create: { clave: 'default', ...data, updatedById: userId },
      update: { ...data, updatedById: userId },
    });
    log.info({ userId }, 'catalog actualizado');
    res.json(serializeCatalog(updated));
  }),
);

/**
 * PUT /api/config/catalog/risk/:nivel — ADMIN/DIRECTOR.
 *
 * El nivel ('A'|'B'|'C') es la PK; aquí sólo permitimos editar las
 * filas existentes. Crear nuevos niveles queda fuera de scope (la UI
 * del cotizador asume A/B/C fijos).
 */
router.put(
  '/catalog/risk/:nivel',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  asyncHandler(async (req: Request, res) => {
    const nivel = req.params.nivel.toUpperCase();
    if (!['A', 'B', 'C'].includes(nivel)) {
      return res.status(400).json({ error: { code: 'INVALID_NIVEL', message: "nivel debe ser 'A', 'B' o 'C'" } });
    }
    const data = riskPresetUpdateSchema.parse(req.body);
    const userId = req.user?.userId ?? null;

    const updated = await prisma.riskPreset.update({
      where: { nivel },
      data: { ...data, updatedById: userId },
    });
    log.info({ userId, nivel }, 'risk preset actualizado');
    return res.json(serializePresets([updated])[0]);
  }),
);

// ──────────────────────────────────────────────────────────────────
// Proveedores GPS — catálogo dinámico
// ──────────────────────────────────────────────────────────────────
//
// GET  /api/config/gps-proveedores        → todos (incluye inactivos)
// PUT  /api/config/gps-proveedores/:clave → upsert (ADMIN/DIRECTOR)
// DEL  /api/config/gps-proveedores/:clave → soft delete (activo=false)

const gpsProveedorSchema = z.object({
  nombre:      z.string().trim().min(1).max(80),
  descripcion: z.string().trim().max(200).optional().nullable(),
  precio24m:   z.coerce.number().min(0).max(1_000_000),
  precio36m:   z.coerce.number().min(0).max(1_000_000),
  precio48m:   z.coerce.number().min(0).max(1_000_000),
  orden:       z.coerce.number().int().min(0).max(99).default(0),
  activo:      z.boolean().default(true),
});

const gpsClaveSchema = z.string().trim().min(1).max(40).regex(
  /^[A-Z0-9_]+$/,
  'La clave sólo acepta MAYÚSCULAS, números y guión bajo (ej. GBR, TECNO_LOGISTIC).',
);

function serializeGpsProveedor(p: Awaited<ReturnType<typeof prisma.gpsProveedor.findFirst>>) {
  if (!p) return null;
  return {
    clave: p.clave,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio24m: toNumber(p.precio24m),
    precio36m: toNumber(p.precio36m),
    precio48m: toNumber(p.precio48m),
    orden: p.orden,
    activo: p.activo,
    updatedAt: p.updatedAt.toISOString(),
    updatedById: p.updatedById,
  };
}

router.get(
  '/gps-proveedores',
  requireAuth,
  asyncHandler(async (_req: Request, res) => {
    const filas = await prisma.gpsProveedor.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
    res.json({ proveedores: filas.map((p) => serializeGpsProveedor(p)) });
  }),
);

router.put(
  '/gps-proveedores/:clave',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  asyncHandler(async (req: Request, res) => {
    const clave = gpsClaveSchema.parse(req.params.clave);
    const data = gpsProveedorSchema.parse(req.body);
    const userId = req.user!.userId;
    const upserted = await prisma.gpsProveedor.upsert({
      where: { clave },
      create: { clave, ...data, updatedById: userId },
      update: { ...data, updatedById: userId },
    });
    log.info({ userId, clave }, 'GPS proveedor actualizado');
    res.json(serializeGpsProveedor(upserted));
  }),
);

router.delete(
  '/gps-proveedores/:clave',
  requireAuth,
  requireRole('ADMIN', 'DIRECTOR'),
  asyncHandler(async (req: Request, res) => {
    const clave = gpsClaveSchema.parse(req.params.clave);
    const userId = req.user!.userId;
    // Soft delete: marca activo=false en lugar de DROP — preserva el
    // histórico (cotizaciones viejas pueden referenciar la clave).
    const updated = await prisma.gpsProveedor.update({
      where: { clave },
      data: { activo: false, updatedById: userId },
    });
    log.info({ userId, clave }, 'GPS proveedor desactivado');
    res.json(serializeGpsProveedor(updated));
  }),
);

export default router;
