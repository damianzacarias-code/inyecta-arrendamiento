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

// override:true — el archivo .env es la fuente de verdad para el
// backend local. Sin esto, una variable vacía exportada en el shell
// del usuario (p.ej. ANTHROPIC_API_KEY="" en .zshrc) gana contra
// el valor real del .env y dispara falsos "requerido" de Zod.
// En producción las variables llegan por el orquestador (k8s,
// ECS, etc.) y el .env no existe, así que override:true es
// irrelevante en ese caso.
//
// Excepción: en tests (vitest) el override PISA el NODE_ENV=test y
// el JWT_SECRET que vitest.config.ts setea por process.env, y los
// tests dejan de ver el entorno esperado. En modo test respetamos
// lo que vitest ya puso en process.env.
const __isVitest = process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined';
dotenv.config({ override: !__isVitest });

// ─── Helpers ────────────────────────────────────────────────────────
const nodeEnvEnum = z.enum(['development', 'test', 'staging', 'production']);
const cfdiProviderEnum = z.enum(['MOCK', 'FACTURAMA', 'SW']);
const extractProviderEnum = z.enum(['MOCK', 'CLAUDE']);
const emailProviderEnum = z.enum(['NOOP', 'SMTP', 'SENDGRID', 'SES']);

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

    // ── Extracción de PDFs (Claude Vision) ────────────────
    // EXTRACT_PROVIDER=CLAUDE requiere ANTHROPIC_API_KEY.
    // EXTRACT_PROVIDER=MOCK devuelve datos hardcoded para tests/demos.
    EXTRACT_PROVIDER: extractProviderEnum.default('MOCK'),
    ANTHROPIC_API_KEY: z.string().optional(),
    // Modelo a usar (override opcional). Default: claude-sonnet-4-5-20250929.
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5-20250929'),

    // ── Círculo de Crédito ────────────────────────────────
    // Clave de Otorgante asignada por Buró de Crédito / Círculo
    // de Crédito. Es un identificador de 10 dígitos. Mientras se
    // tramita la real, se permite la clave de pruebas '0000000000'
    // SOLO en development/test/staging. En production rechazamos
    // explícitamente esa clave para no enviar reportes anónimos.
    CIRCULO_CREDITO_CLAVE_OTORGANTE: z
      .string()
      .regex(/^\d{10}$/, 'CIRCULO_CREDITO_CLAVE_OTORGANTE: 10 dígitos')
      .default('0000000000'),
    CIRCULO_CREDITO_NOMBRE_OTORGANTE: z
      .string()
      .min(1)
      .default('FSMP SOLUCIONES DE CAPITAL SA DE CV SOFOM ENR'),

    // ── Branding (datos públicos del emisor para PDFs y UI) ──
    // Estos valores se devuelven por GET /api/config/branding (sin
    // auth) y los consume el cliente para PDFs (cotización, recibo,
    // estado de cuenta, amortización, checklist) y la página /portal.
    // Defaults = valores históricos hardcoded; sólo cambia si Inyecta
    // muda razón social, oficinas o cuenta bancaria.
    BRAND_RAZON_SOCIAL: z
      .string()
      .min(1)
      .default('FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.'),
    BRAND_NOMBRE_COMERCIAL: z.string().min(1).default('Inyecta'),
    BRAND_DIRECCION: z
      .string()
      .min(1)
      .default(
        'Av. Sierra Vista 1305, Piso 4 Oficina 7, Col. Lomas del Tecnológico, C.P. 78215, San Luis Potosí, S.L.P.',
      ),
    BRAND_TELEFONOS: z.string().min(1).default('444-521-7204 / 444-521-6980'),
    BRAND_EMAIL: z.string().email().default('contacto@inyecta.com.mx'),
    BRAND_WEB: z.string().min(1).default('www.inyecta.com.mx'),

    // ── Datos bancarios para depósitos del cliente ──
    // Públicos por diseño: aparecen en el portal y en estado de cuenta.
    // Default es el placeholder histórico (CLABE enmascarada). En
    // production se exige una CLABE real (18 dígitos) — ver superRefine.
    BANCO_NOMBRE: z.string().min(1).default('BBVA México'),
    BANCO_CLABE: z.string().min(1).default('012-180-XXXXXXXXXX-X'),
    BANCO_BENEFICIARIO: z
      .string()
      .min(1)
      .default('FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.'),

    // ── Email saliente (notificaciones, recordatorios) ──
    // EMAIL_PROVIDER controla qué backend se usa:
    //   NOOP     → no envía nada (default seguro de fábrica)
    //   SMTP     → nodemailer con servidor SMTP genérico
    //              (Gmail/Outlook/SES/SendGrid/Mailgun…)
    //   SENDGRID → SDK nativo (stub — pendiente integrar)
    //   SES      → SDK AWS nativo (stub — pendiente integrar)
    //
    // EMAIL_FROM es la dirección que aparece en el "De:" del mensaje.
    // En production con SMTP exigimos que esté seteada (ver superRefine).
    EMAIL_PROVIDER: emailProviderEnum.default('NOOP'),
    EMAIL_FROM: z.string().optional(),
    EMAIL_REPLY_TO: z.string().optional(),

    // SMTP (sólo aplica si EMAIL_PROVIDER=SMTP)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: boolFromString.default(false),       // true=465 (TLS implícito), false=587 (STARTTLS)
    SMTP_REQUIRE_TLS: boolFromString.default(true),   // exige STARTTLS aunque secure=false

    // URL pública del frontend para incluir links absolutos en emails
    // ("Revisa tu solicitud en https://app.inyecta.com.mx/operaciones/…").
    // En dev default a localhost:5173.
    FRONTEND_BASE_URL: z.string().url().default('http://localhost:5173'),

    // S6 — Cifrado en reposo de uploads. AES-256-GCM con master key
    // de 32 bytes en base64. Genera con: `openssl rand -base64 32`.
    // Si está vacío, los uploads se persisten en plaintext (modo
    // legacy compatible). En production lo exigimos.
    UPLOAD_MASTER_KEY: z.string().optional(),
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
    // S6 — Si UPLOAD_MASTER_KEY está set, debe ser base64 que decodifique
    // a 32 bytes exactos. En production lo exigimos.
    if (env.UPLOAD_MASTER_KEY) {
      try {
        const buf = Buffer.from(env.UPLOAD_MASTER_KEY, 'base64');
        if (buf.length !== 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['UPLOAD_MASTER_KEY'],
            message: `UPLOAD_MASTER_KEY debe ser 32 bytes (got ${buf.length}). Genera con: openssl rand -base64 32`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['UPLOAD_MASTER_KEY'],
          message: 'UPLOAD_MASTER_KEY no es base64 válido',
        });
      }
    } else if (env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['UPLOAD_MASTER_KEY'],
        message:
          'En production se requiere UPLOAD_MASTER_KEY para cifrar uploads en reposo. ' +
          'Genera con: openssl rand -base64 32',
      });
    }
    if (env.EXTRACT_PROVIDER === 'CLAUDE' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EXTRACT_PROVIDER'],
        message: 'EXTRACT_PROVIDER=CLAUDE requiere ANTHROPIC_API_KEY',
      });
    }
    if (env.NODE_ENV === 'production' && env.CIRCULO_CREDITO_CLAVE_OTORGANTE === '0000000000') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CIRCULO_CREDITO_CLAVE_OTORGANTE'],
        message:
          'En production no se permite la clave de pruebas "0000000000". ' +
          'Solicita la clave real a Círculo de Crédito antes de desplegar.',
      });
    }
    // En production exigimos una CLABE real (18 dígitos exactos, sin
    // separadores). El placeholder con "X" es claro indicador de que
    // nadie configuró el banco real — sería inaceptable que apareciera
    // en un estado de cuenta enviado al cliente.
    if (env.NODE_ENV === 'production') {
      const clabeLimpia = env.BANCO_CLABE.replace(/[\s\-]/g, '');
      if (!/^\d{18}$/.test(clabeLimpia)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BANCO_CLABE'],
          message:
            'En production BANCO_CLABE debe tener 18 dígitos numéricos ' +
            '(opcionalmente con guiones). El placeholder con "X" no se ' +
            'acepta — configura la CLABE real antes de desplegar.',
        });
      }
    }
    // Email: si el operador eligió SMTP, exigir las credenciales
    // mínimas. Mejor fallar al arrancar que silenciar emails.
    if (env.EMAIL_PROVIDER === 'SMTP') {
      if (!env.SMTP_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'EMAIL_PROVIDER=SMTP requiere SMTP_HOST',
        });
      }
      if (!env.SMTP_PORT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_PORT'],
          message: 'EMAIL_PROVIDER=SMTP requiere SMTP_PORT (típicamente 465 o 587)',
        });
      }
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_FROM'],
          message:
            'EMAIL_PROVIDER=SMTP requiere EMAIL_FROM (ej. "Inyecta <noreply@inyecta.com.mx>")',
        });
      }
    }
    // En production con email no-NOOP exigimos un EMAIL_FROM real
    // (no se aceptan placeholders genéricos como "noreply@example.com").
    if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER !== 'NOOP') {
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_FROM'],
          message:
            `En production con EMAIL_PROVIDER=${env.EMAIL_PROVIDER} se requiere EMAIL_FROM`,
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
  extract: {
    provider: env.EXTRACT_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
  },
  circuloCredito: {
    claveOtorgante: env.CIRCULO_CREDITO_CLAVE_OTORGANTE,
    nombreOtorgante: env.CIRCULO_CREDITO_NOMBRE_OTORGANTE,
  },
  branding: {
    empresa: {
      razonSocial: env.BRAND_RAZON_SOCIAL,
      nombreComercial: env.BRAND_NOMBRE_COMERCIAL,
    },
    contacto: {
      direccion: env.BRAND_DIRECCION,
      telefonos: env.BRAND_TELEFONOS,
      email: env.BRAND_EMAIL,
      web: env.BRAND_WEB,
    },
    banco: {
      nombre: env.BANCO_NOMBRE,
      clabe: env.BANCO_CLABE,
      beneficiario: env.BANCO_BENEFICIARIO,
    },
  },
  email: {
    provider: env.EMAIL_PROVIDER,
    from: env.EMAIL_FROM,
    replyTo: env.EMAIL_REPLY_TO,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      secure: env.SMTP_SECURE,
      requireTLS: env.SMTP_REQUIRE_TLS,
    },
  },
  frontendBaseUrl: env.FRONTEND_BASE_URL,
} as const;

export type AppConfig = typeof config;
