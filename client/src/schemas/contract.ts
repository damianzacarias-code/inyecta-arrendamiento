// ⚠️  MIRROR de server/src/schemas/contract.ts — mantener sincronizado.
//     Si modificas este archivo, actualiza el equivalente del servidor
//     (y sus tests en server/src/schemas/__tests__/).
// Zod schemas para Contract + PerfilTransaccional + Proveedor +
// DeclaracionPEP. Cubre el lado "Nueva Operación" de la solicitud
// CNBV (páginas 2-3 del PDF).
//
// Reglas condicionales implementadas:
//
//   PerfilTransaccional:
//     - Si realizaPagosEfectivo=true → exige efectivoMotivos +
//       efectivoMontoMensual
//
//   DeclaracionPEP:
//     - Si esPep=true → exige dependencia + puesto + periodoEjercicio
//       + principalesFunciones
//     - Si tipo=PARIENTE y esPep=true → también exige nombre (del
//       pariente PEP) y parentesco (relación con el titular)
//
//   Terceros (beneficiario/aportante):
//     - Si tercerBeneficiarioExiste=true → exige tercerBeneficiarioInfo
//     - Si tercerAportanteExiste=true → exige tercerAportanteInfo

import { z } from 'zod';
import {
  dateOpt,
  decimalOpt,
  emailOpt,
  optionalString,
  requiredString,
  zFrecuenciaTrans,
  zMontoRango,
  zNumOpsRango,
  zPepTipo,
} from './common';
import { linkContractGuarantorSchema } from './guarantor';

// ── Proveedor (1:1 con Contract) ────────────────────────────────

export const proveedorSchema = z.object({
  nombre: requiredString,
  nombreContacto: optionalString,
  telefono: optionalString,
  email: emailOpt,
});

export type ProveedorInput = z.infer<typeof proveedorSchema>;

// ── PerfilTransaccional (1:1 con Contract) ──────────────────────

export const perfilTransaccionalSchema = z
  .object({
    productosQueAdquirira: optionalString,
    origenRecursos: optionalString,
    destinoRecursos: optionalString,
    montoMensualRango: zMontoRango.optional(),
    frecuencia: zFrecuenciaTrans.optional(),
    numOperacionesRango: zNumOpsRango.optional(),
    realizaPagosEfectivo: z.boolean().optional(),
    efectivoMotivos: optionalString,
    efectivoMontoMensual: decimalOpt,
  })
  .superRefine((data, ctx) => {
    if (data.realizaPagosEfectivo === true) {
      if (!data.efectivoMotivos) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['efectivoMotivos'],
          message: 'Requerido cuando declara pagos en efectivo',
        });
      }
      if (!data.efectivoMontoMensual) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['efectivoMontoMensual'],
          message: 'Requerido cuando declara pagos en efectivo',
        });
      }
    }
  });

export type PerfilTransaccionalInput = z.infer<typeof perfilTransaccionalSchema>;

// ── DeclaracionPEP (1:n con Contract, max 3 por tipo) ───────────

export const declaracionPEPSchema = z
  .object({
    tipo: zPepTipo,
    esPep: z.boolean(),

    // Condicionales a esPep=true:
    nombre: optionalString,
    parentesco: optionalString,
    dependencia: optionalString,
    puesto: optionalString,
    periodoEjercicio: optionalString,
    principalesFunciones: optionalString,
  })
  .superRefine((data, ctx) => {
    if (data.esPep === true) {
      if (!data.dependencia) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dependencia'],
          message: 'Requerido cuando declara PEP',
        });
      }
      if (!data.puesto) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['puesto'],
          message: 'Requerido cuando declara PEP',
        });
      }
      if (!data.periodoEjercicio) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['periodoEjercicio'],
          message: 'Requerido cuando declara PEP',
        });
      }
      if (!data.principalesFunciones) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['principalesFunciones'],
          message: 'Requerido cuando declara PEP',
        });
      }
      if (data.tipo === 'PARIENTE') {
        if (!data.nombre) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nombre'],
            message: 'Nombre del pariente PEP requerido',
          });
        }
        if (!data.parentesco) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['parentesco'],
            message: 'Parentesco con el titular requerido',
          });
        }
      }
    }
  });

export type DeclaracionPEPInput = z.infer<typeof declaracionPEPSchema>;

// ── Contract (root — Nueva Operación) ───────────────────────────

/**
 * Schema para crear un contrato nuevo incluyendo todos los datos
 * de solicitud KYC. Los handlers existentes de /api/contracts
 * pueden pasar primero por `createContractCoreSchema` (ya existente
 * en routes/contracts.ts) y luego componer con este.
 *
 * Aquí sólo definimos los BLOQUES NUEVOS agregados por la solicitud
 * CNBV, para que el wizard los envíe como un payload anidado:
 *
 *   {
 *     ...campos base del contrato...,
 *     lugarSolicitud, fechaSolicitud, promotor, montoSolicitado,
 *     destinoArrendamiento,
 *     tercerBeneficiarioExiste, tercerBeneficiarioInfo,
 *     tercerAportanteExiste, tercerAportanteInfo,
 *     proveedor: { ... },
 *     perfilTransaccional: { ... },
 *     declaracionesPEP: [ {tipo:SOLICITANTE,...}, ... ],
 *     obligadosSolidarios: [ {guarantorId, orden}, ... ]
 *   }
 */
/**
 * ZodObject "crudo" con los campos KYC (sin reglas condicionales).
 * Expuesto para que otros schemas puedan componerlo vía `.merge()`.
 * Úsalo junto con `contractKycRefine` para aplicar las reglas.
 */
export const contractKycFieldsObject = z.object({
  // Datos de la solicitud (página 1 → Nueva Operación)
  lugarSolicitud: optionalString,
  fechaSolicitud: dateOpt,
  promotor: optionalString,
  montoSolicitado: decimalOpt,
  destinoArrendamiento: optionalString,

  // Terceros
  tercerBeneficiarioExiste: z.boolean().optional(),
  tercerBeneficiarioInfo: optionalString,
  tercerAportanteExiste: z.boolean().optional(),
  tercerAportanteInfo: optionalString,

  // Relaciones anidadas
  proveedor: proveedorSchema.optional(),
  perfilTransaccional: perfilTransaccionalSchema.optional(),
  declaracionesPEP: z.array(declaracionPEPSchema).optional(),
  obligadosSolidarios: z.array(linkContractGuarantorSchema).max(3).optional(),
});

/**
 * SuperRefine reusable con las reglas condicionales del bloque KYC.
 * Se aplica tanto al schema standalone como al schema compuesto de
 * crear contrato (que fusiona campos base financieros + este bloque).
 */
export function contractKycRefine(
  data: {
    tercerBeneficiarioExiste?: boolean;
    tercerBeneficiarioInfo?: string;
    tercerAportanteExiste?: boolean;
    tercerAportanteInfo?: string;
    obligadosSolidarios?: Array<{ orden: number; guarantorId: string }>;
    declaracionesPEP?: Array<{ tipo: string }>;
  },
  ctx: z.RefinementCtx,
): void {
  // Terceros: si dice "sí existe", exige la info
  if (data.tercerBeneficiarioExiste === true && !data.tercerBeneficiarioInfo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tercerBeneficiarioInfo'],
      message: 'Requerido cuando declara que existe tercer beneficiario',
    });
  }
  if (data.tercerAportanteExiste === true && !data.tercerAportanteInfo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tercerAportanteInfo'],
      message: 'Requerido cuando declara que existe tercer aportante',
    });
  }

  // Unicidad de `orden` en obligados solidarios (DB lo enforcea,
  // pero lo atrapamos antes para dar mejor error)
  if (data.obligadosSolidarios) {
    const ordenes = data.obligadosSolidarios.map((g) => g.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['obligadosSolidarios'],
        message: 'Cada obligado solidario debe tener un orden distinto (1, 2, 3)',
      });
    }
    const guarantorIds = data.obligadosSolidarios.map((g) => g.guarantorId);
    if (new Set(guarantorIds).size !== guarantorIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['obligadosSolidarios'],
        message: 'No puede repetirse el mismo aval en una operación',
      });
    }
  }

  // Unicidad de `tipo` en declaracionesPEP (DB lo enforcea vía
  // @@unique([contractId, tipo]))
  if (data.declaracionesPEP) {
    const tipos = data.declaracionesPEP.map((d) => d.tipo);
    if (new Set(tipos).size !== tipos.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['declaracionesPEP'],
        message: 'Solo una declaración PEP por tipo (SOLICITANTE, PARIENTE, SOCIO_ACCIONISTA)',
      });
    }
  }
}

/**
 * Schema standalone del bloque KYC (útil para PATCH separado).
 */
export const contractKycFieldsSchema = contractKycFieldsObject.superRefine(contractKycRefine);

export type ContractKycFieldsInput = z.infer<typeof contractKycFieldsSchema>;
