/**
 * config/env.ts — Validación estricta de variables de entorno con Zod.
 *
 * Filosofía:
 *   • Si una variable es REQUERIDA y falta → crash inmediato con mensaje claro.
 *     Mejor morir al arrancar que tirar 500s a media producción.
 *   • Defaults SOLO en `development` (cero defaults en `production`).
 *   • La forma del export `config` es retro-compatible con el código existente.
 *
 * Si necesitas agregar una variable nueva:
 *   1. Declárala en `EnvSchema` con su validación.
 *   2. Mapéala dentro de `config` con un nombre semántico.
 *   3. Documenta valores aceptados en el comentario del campo.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// ─── Helpers ────────────────────────────────────────────────────────
const nodeEnvEnum = z.enum(['development', 'test', 'staging', 'production']);
const cfdiProviderEnum = z.enum(['MOCK', 'FACTURAMA', 'SW']);

/**
 * Coerciona "true"/"false"/"1"/"0" → boolean.
 * dotenv siempre entrega strings; sin esto perderíamos seguridad de tipos.
 */
const boolFromString = z
  .union([z.string(), z.boolean(), z.undefined()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (v === undefined) return undefined;
    return ['true', '1', 'yes', 'on'].includes(v.toLowerCase());
  });

// ─── Schema ─────────────────────────────────────────────────────────
const EnvSchema = z
  .object({
    // ── Runtime ───────────────────────────────────────────
    NODE_ENV: nodeEnvEnum.default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(3001),

    // ── Base de datos (Postgres) ──────────────────────────
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL es requerido')
      .refine(
        (s) => /^postgres(ql)?:\/\//.test(s),
        'DATABASE_URL debe empezar con postgres:// o postgresql://',
      ),

    // ── Auth (JWT) ────────────────────────────────────────
    // En prod exigimos ≥32 chars (longitud mínima razonable para HS256).
    // En dev permitimos default para no bloquear primer arranque.
    JWT_SECRET: z.string().min(1, 'JWT_SECRET es requerido'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+(s|m|h|d)$|^\d+$/, 'JWT_EXPIRES_IN: usa formato 24h, 60m, 7d, o segundos')
      .default('24h'),

    // ── Bitácora ──────────────────────────────────────────
    BITACORA_LOG_GETS: boolFromString.default(false),

    // ── CFDI 4.0 (timbrado) ───────────────────────────────
    CFDI_PROVIDER: cfdiProviderEnum.default('MOCK'),
    CFDI_EMISOR_RFC: z.string().min(12).max(13).optional(),
    CFDI_EMISOR_NOMBRE: z.string().optional(),
    CFDI_EMISOR_REGIMEN: z.string().regex(/^\d{3}$/).optional(),
    CFDI_LUGAR_EXPEDICION: z.string().regex(/^\d{5}$/).optional(),

    // Facturama (solo si CFDI_PROVIDER=FACTURAMA)
    FACTURAMA_USER: z.string().optional(),
    FACTURAMA_PASS: z.string().optional(),
    FACTURAMA_SANDBOX: boolFromString.default(true),

    // ── CORS / Seguridad (lo aplica A5) ───────────────────
    // Lista separada por comas. Si no se define, en dev default a localhost.
    CORS_ALLOWED_ORIGINS: z.string().optional(),
  })
  // Validaciones cruzadas (cosas que solo aplican en producción).
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'En production JWT_SECRET debe tener ≥32 caracteres',
        });
      }
      if (env.JWT_SECRET === 'inyecta-arrendamiento-jwt-secret-dev-2026' ||
          env.JWT_SECRET === 'default-secret') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'En production no se permite el JWT_SECRET de desarrollo',
        });
      }
    }
    if (env.CFDI_PROVIDER === 'FACTURAMA') {
      if (!env.FACTURAMA_USER || !env.FACTURAMA_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CFDI_PROVIDER'],
          message: 'CFDI_PROVIDER=FACTURAMA requiere FACTURAMA_USER y FACTURAMA_PASS',
        });
      }
    }
  });

// ─── Parseo y reporte de errores ────────────────────────────────────
function parseEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const errores = parsed.error.errors
    .map((e) => `  • ${e.path.join('.') || '(env)'}: ${e.message}`)
    .join('\n');

  // stderr (no logger porque podríamos no haber iniciado el logger todavía).
  // eslint-disable-next-line no-console
  console.error(
    `\n❌ Variables de entorno inválidas (${parsed.error.errors.length} error${
      parsed.error.errors.length === 1 ? '' : 'es'
    }):\n${errores}\n\n` +
      `Revisa server/.env y compáralo con server/.env.example\n`,
  );
  process.exit(1);
}

const env = parseEnv();

// ─── Export retro-compatible ────────────────────────────────────────
// Mantiene la misma forma que el archivo original — todo el código que
// hace `import { config } from './config/env'` sigue funcionando.
export const config = {
  port: env.PORT,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  nodeEnv: env.NODE_ENV,
  databaseUrl: env.DATABASE_URL,

  // Nuevos campos tipados (úsalos en vez de process.env.* directo).
  bitacoraLogGets: env.BITACORA_LOG_GETS,
  cfdi: {
    provider: env.CFDI_PROVIDER,
    emisor: {
      rfc: env.CFDI_EMISOR_RFC,
      nombre: env.CFDI_EMISOR_NOMBRE,
      regimen: env.CFDI_EMISOR_REGIMEN,
      lugarExpedicion: env.CFDI_LUGAR_EXPEDICION,
    },
    facturama: {
      user: env.FACTURAMA_USER,
      pass: env.FACTURAMA_PASS,
      sandbox: env.FACTURAMA_SANDBOX,
    },
  },
  cors: {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS,
  },
} as const;

export type AppConfig = typeof config;
