// Schema composed del wizard Nueva Operación.
//
// Combina la base financiera del contrato (definida aquí porque el
// server la tiene inline en routes/contracts.ts) con el bloque KYC
// espejado desde server/src/schemas/contract.ts. Las reglas
// condicionales del KYC se re-aplican vía contractKycRefine.
//
// Este schema NO existe en el server como una sola pieza — el server
// lo construye con `createContractBaseSchema.merge(contractKycFieldsObject)
// .superRefine(contractKycRefine)` en routes/contracts.ts. Mantener los
// campos base en sincronía con ese archivo.

import { z } from 'zod';
import {
  contractKycFieldsObject,
  contractKycRefine,
} from '@/schemas/contract';

// ── Campos base del contrato (financieros + datos del bien) ──────
//
// MIRROR lógico de server/src/routes/contracts.ts#createContractBaseSchema.
// Si cambias uno, actualiza el otro.
export const contractBaseFieldsObject = z.object({
  clientId: z.string().min(1, 'Selecciona un cliente'),
  quotationId: z.string().optional(),
  categoriaId: z.string().optional(),
  bienDescripcion: z.string().trim().min(1, 'Descripción del bien requerida'),
  bienMarca: z.string().optional(),
  bienModelo: z.string().optional(),
  bienAnio: z.number().optional(),
  bienNumSerie: z.string().optional(),
  bienEstado: z.string().optional(),
  proveedorLegacy: z.string().optional(),
  producto: z.enum(['PURO', 'FINANCIERO']),
  valorBien: z.number().min(150000, 'El valor del bien debe ser mínimo $150,000'),
  plazo: z.number().min(12).max(48),
  tasaAnual: z.number().default(0.36),
  nivelRiesgo: z.enum(['A', 'B', 'C']).default('A'),
  enganche: z.number().default(0),
  depositoGarantia: z.number().default(0),
  comisionApertura: z.number().default(0),
  rentaInicial: z.number().default(0),
  gpsInstalacion: z.number().default(0),
  seguroAnual: z.number().default(0),
  valorResidual: z.number().default(0),
  montoFinanciar: z.number(),
  rentaMensual: z.number(),
  rentaMensualIVA: z.number(),
});

/**
 * Schema completo del wizard = financiero base + KYC + reglas
 * condicionales del bloque KYC (terceros, unicidad de aval/PEP,
 * pagos en efectivo, PEP obligatorio si esPep=true).
 */
export const createContractWizardSchema = contractBaseFieldsObject
  .merge(contractKycFieldsObject)
  .superRefine(contractKycRefine);

export type CreateContractWizardInput = z.infer<typeof createContractWizardSchema>;
