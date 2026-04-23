/**
 * types.ts — Tipos públicos del módulo de extracción de PDFs.
 *
 * El sistema soporta extraer estructura de 5 tipos de documentos del
 * expediente del arrendamiento, usando un modelo multimodal (Claude
 * Vision) o un mock determinista para desarrollo / tests.
 */

/** Tipos de documentos cuya extracción está soportada por el módulo. */
export const TIPOS_EXTRACT = [
  'CSF',                     // Constancia de Situación Fiscal SAT
  'INE',                     // Identificación oficial
  'COMPROBANTE_DOMICILIO',   // CFE / Telmex / Agua / Predial
  'FACTURA_BIEN',            // Factura del proveedor del bien arrendado
  'ACTA_CONSTITUTIVA',       // Acta constitutiva (PM)
] as const;

export type TipoExtract = (typeof TIPOS_EXTRACT)[number];

/** Resultado uniforme que devuelve todo provider de extracción. */
export interface ExtractResult {
  /** true si el modelo devolvió datos parseables. */
  ok: boolean;
  /** Datos extraídos. La forma depende del `tipo` de documento (ver schemas.ts). */
  data: Record<string, unknown>;
  /**
   * Confianza heurística del resultado en [0, 1].
   * - 1.0  → todos los campos del schema vienen poblados y válidos.
   * - 0.5–0.8 → algunos campos null o ambiguos.
   * - 0.0  → no se pudo extraer (ok=false).
   * El frontend puede mostrar un warning cuando confidence < 0.7.
   */
  confidence: number;
  /** Identificador del provider que produjo el resultado. */
  provider: 'MOCK' | 'CLAUDE';
  /** Texto crudo devuelto por el modelo (solo presente en errores o debug). */
  raw?: string;
  /** Mensaje legible si ok=false. */
  error?: string;
}

/** Contrato que todo provider de extracción debe implementar. */
export interface IExtractProvider {
  readonly name: 'MOCK' | 'CLAUDE';
  extract(file: Buffer, mimeType: string, tipo: TipoExtract): Promise<ExtractResult>;
}
