/**
 * Distribución de aporte inicial entre Enganche y Depósito en Garantía
 * según nivel de riesgo. Sustituye la captura separada de los dos
 * porcentajes por un único número (% del valorBien que el cliente
 * entrega al inicio), que el sistema reparte automáticamente.
 *
 * Reglas (Damián, 27-04-2026):
 *   BAJO   (clave 'A')
 *     - aporte < 15%        → ❌ rechazo
 *     - 15% ≤ aporte < 20%  → opción A "Menor desembolso":
 *                              DG fijo 10%, exceso al enganche
 *     - aporte ≥ 20%        → opción B "Menor renta":
 *                              DG fijo  5%, exceso al enganche
 *   MEDIO  (clave 'B')
 *     - aporte < 20%  → ❌ rechazo
 *     - aporte ≥ 20%  → DG fijo 10%, exceso al enganche
 *   ALTO   (clave 'C')
 *     - aporte < 30%  → ❌ rechazo
 *     - aporte ≥ 30%  → DG fijo 20%, exceso al enganche
 *
 * El motor de cotización (calculos.ts) sigue recibiendo enganche y DG
 * como porcentajes independientes — esta lib es una capa upstream que
 * convierte el "aporte único" capturado por el operador en el par
 * (enganche, DG). Cuando el operador activa "edición manual" en el UI,
 * el cotizador deja de llamar a esta lib y captura los dos % por
 * separado (override casos especiales).
 *
 * NOTA roles (TODO R2): hoy esta lib NO bloquea cuando el aporte cae
 * debajo del mínimo del nivel — devuelve `valido: false` con un mensaje,
 * y la UI muestra warning informativo pero deja generar la cotización
 * (Damián quiere comparar). Cuando se implementen roles, los roles
 * operativos verán bloqueo duro; ADMIN/DIRECTOR mantienen el override.
 */

/** Nivel de riesgo. Mapea 1:1 con el enum Prisma `RiskLevel`. */
export type NivelRiesgo = 'A' | 'B' | 'C';

/** Cuál de las dos sub-opciones de Riesgo Bajo se aplicó. */
export type OpcionBajo = 'A' | 'B';

export interface DistribucionResultado {
  /** Porcentaje del valorBien que se asigna al enganche (0..1). */
  enganchePct: number;
  /** Porcentaje del valorBien que se asigna al depósito en garantía (0..1). */
  depositoGarantiaPct: number;
  /**
   * Si la operación cumple el mínimo del nivel. Cuando es false, los
   * porcentajes devueltos son los de "tope" (mínimos del nivel) — sirven
   * para que el cotizador siga calculando algo razonable mientras se
   * muestra el warning. La UI decide si aceptar o no.
   */
  valido: boolean;
  /**
   * Sub-opción de Riesgo Bajo aplicada (sólo para nivel='A'). Determina
   * el lema comercial mostrado al cliente: 'A' = "Menor desembolso",
   * 'B' = "Menor renta". null para nivel medio/alto.
   */
  opcionBajo: OpcionBajo | null;
  /** Mensaje informativo / advertencia para el operador. null si todo OK. */
  warning: string | null;
}

/** Mínimos por nivel — fuente de verdad de la política comercial. */
export const MINIMOS_NIVEL = {
  A: { aporteMin: 0.15, dgFijo: 0.10, dgFijoOpcionB: 0.05, cortePct: 0.20 },
  B: { aporteMin: 0.20, dgFijo: 0.10 },
  C: { aporteMin: 0.30, dgFijo: 0.20 },
} as const;

/**
 * Aporte sugerido como default cuando el operador cambia de nivel. Coincide
 * con el mínimo del nivel para que la UI muestre la combinación "más
 * barata" y el operador pueda subir desde ahí.
 */
export const APORTE_SUGERIDO: Record<NivelRiesgo, number> = {
  A: MINIMOS_NIVEL.A.aporteMin,   // 15% → opción A pura
  B: MINIMOS_NIVEL.B.aporteMin,   // 20%
  C: MINIMOS_NIVEL.C.aporteMin,   // 30%
};

/** Redondea a 4 decimales para evitar 0.30000000004 en sliders. */
function r4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Distribuye el aporte inicial (porcentaje sobre valorBien sin IVA)
 * entre enganche y DG según el nivel de riesgo.
 *
 * Pura — sin Decimal.js porque trabajamos en escala 0..1 y dos
 * decimales son suficientes para porcentajes (no son montos directos).
 * El motor downstream (`calcularCotizacion`) sí usa Decimal.js sobre
 * los porcentajes que devuelve esta función.
 */
export function distribuirAporte(
  nivel: NivelRiesgo,
  aportePct: number,
): DistribucionResultado {
  if (aportePct < 0) {
    return {
      enganchePct: 0,
      depositoGarantiaPct: MINIMOS_NIVEL[nivel].dgFijo,
      valido: false,
      opcionBajo: nivel === 'A' ? 'A' : null,
      warning: 'El aporte no puede ser negativo',
    };
  }

  // ── Nivel BAJO (A) ─────────────────────────────────────────────────
  if (nivel === 'A') {
    const min = MINIMOS_NIVEL.A;

    if (aportePct < min.aporteMin) {
      // Debajo del mínimo: devolvemos el split de la opción A pura
      // (5%/10%) para que la UI tenga algo que mostrar, pero marcamos
      // valido=false para el warning.
      return {
        enganchePct: 0.05,
        depositoGarantiaPct: 0.10,
        valido: false,
        opcionBajo: 'A',
        warning: `Riesgo bajo requiere mínimo ${(min.aporteMin * 100).toFixed(0)}% (5% enganche + 10% DG)`,
      };
    }

    // Corte en 20%: cuando el aporte es >= 20% switcheamos a opción B
    // automáticamente (DG fijo 5%, resto a enganche). Per Damián
    // 27-04-2026: bajo aporte=20% → 15% eng + 5% DG.
    if (aportePct >= min.cortePct) {
      return {
        enganchePct: r4(aportePct - min.dgFijoOpcionB),
        depositoGarantiaPct: min.dgFijoOpcionB,
        valido: true,
        opcionBajo: 'B',
        warning: null,
      };
    }

    // Rango 15% ≤ aporte < 20%: opción A pura, exceso al enganche
    return {
      enganchePct: r4(aportePct - min.dgFijo),
      depositoGarantiaPct: min.dgFijo,
      valido: true,
      opcionBajo: 'A',
      warning: null,
    };
  }

  // ── Nivel MEDIO (B) ────────────────────────────────────────────────
  if (nivel === 'B') {
    const min = MINIMOS_NIVEL.B;
    if (aportePct < min.aporteMin) {
      return {
        enganchePct: 0.10,
        depositoGarantiaPct: min.dgFijo,
        valido: false,
        opcionBajo: null,
        warning: `Riesgo medio requiere mínimo ${(min.aporteMin * 100).toFixed(0)}% (10% enganche + 10% DG)`,
      };
    }
    return {
      enganchePct: r4(aportePct - min.dgFijo),
      depositoGarantiaPct: min.dgFijo,
      valido: true,
      opcionBajo: null,
      warning: null,
    };
  }

  // ── Nivel ALTO (C) ─────────────────────────────────────────────────
  const min = MINIMOS_NIVEL.C;
  if (aportePct < min.aporteMin) {
    return {
      enganchePct: 0.10,
      depositoGarantiaPct: min.dgFijo,
      valido: false,
      opcionBajo: null,
      warning: `Riesgo alto requiere mínimo ${(min.aporteMin * 100).toFixed(0)}% (10% enganche + 20% DG)`,
    };
  }
  return {
    enganchePct: r4(aportePct - min.dgFijo),
    depositoGarantiaPct: min.dgFijo,
    valido: true,
    opcionBajo: null,
    warning: null,
  };
}

/**
 * Lema comercial mostrado en la cotización para identificar la
 * sub-opción de Riesgo Bajo aplicada.
 */
export function lemaOpcionBajo(opcion: OpcionBajo | null): string | null {
  if (opcion === 'A') return 'Menor desembolso';
  if (opcion === 'B') return 'Menor renta';
  return null;
}
