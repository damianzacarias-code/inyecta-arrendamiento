/**
 * Distribución de aporte inicial — espejo server de la lib del cliente
 * (`client/src/lib/cotizacion/distribucion.ts`). Mantenidas en sync
 * porque el server valida que los porcentajes que llegan en POST
 * /quotations y /contracts sean coherentes con el aporte total
 * declarado y el nivel de riesgo seleccionado (defensa contra
 * payloads manipulados / clientes legacy).
 *
 * Si el cliente envía `edicionManual: true`, esta lib NO se usa para
 * validación — el operador queda autorizado a capturar enganche y DG
 * por separado. En fase Roles (TODO R2) sólo ADMIN/DIRECTOR podrán
 * enviar ese flag.
 *
 * Reglas (Damián, 27-04-2026): ver header de la lib del cliente.
 */

export type NivelRiesgo = 'A' | 'B' | 'C';
export type OpcionBajo = 'A' | 'B';

export interface DistribucionResultado {
  enganchePct: number;
  depositoGarantiaPct: number;
  valido: boolean;
  opcionBajo: OpcionBajo | null;
  warning: string | null;
}

export const MINIMOS_NIVEL = {
  A: { aporteMin: 0.15, dgFijo: 0.10, dgFijoOpcionB: 0.05, cortePct: 0.20 },
  B: { aporteMin: 0.20, dgFijo: 0.10 },
  C: { aporteMin: 0.30, dgFijo: 0.20 },
} as const;

function r4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

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

  if (nivel === 'A') {
    const min = MINIMOS_NIVEL.A;
    if (aportePct < min.aporteMin) {
      return {
        enganchePct: 0.05, depositoGarantiaPct: 0.10,
        valido: false, opcionBajo: 'A',
        warning: `Riesgo bajo requiere mínimo ${(min.aporteMin * 100).toFixed(0)}% (5% enganche + 10% DG)`,
      };
    }
    if (aportePct >= min.cortePct) {
      return {
        enganchePct: r4(aportePct - min.dgFijoOpcionB),
        depositoGarantiaPct: min.dgFijoOpcionB,
        valido: true, opcionBajo: 'B', warning: null,
      };
    }
    return {
      enganchePct: r4(aportePct - min.dgFijo),
      depositoGarantiaPct: min.dgFijo,
      valido: true, opcionBajo: 'A', warning: null,
    };
  }

  if (nivel === 'B') {
    const min = MINIMOS_NIVEL.B;
    if (aportePct < min.aporteMin) {
      return {
        enganchePct: 0.10, depositoGarantiaPct: min.dgFijo,
        valido: false, opcionBajo: null,
        warning: `Riesgo medio requiere mínimo ${(min.aporteMin * 100).toFixed(0)}% (10% enganche + 10% DG)`,
      };
    }
    return {
      enganchePct: r4(aportePct - min.dgFijo),
      depositoGarantiaPct: min.dgFijo,
      valido: true, opcionBajo: null, warning: null,
    };
  }

  // Nivel C
  const min = MINIMOS_NIVEL.C;
  if (aportePct < min.aporteMin) {
    return {
      enganchePct: 0.10, depositoGarantiaPct: min.dgFijo,
      valido: false, opcionBajo: null,
      warning: `Riesgo alto requiere mínimo ${(min.aporteMin * 100).toFixed(0)}% (10% enganche + 20% DG)`,
    };
  }
  return {
    enganchePct: r4(aportePct - min.dgFijo),
    depositoGarantiaPct: min.dgFijo,
    valido: true, opcionBajo: null, warning: null,
  };
}

/**
 * Valida que un payload (nivel, aporte, enganche, DG) sea coherente.
 * Devuelve null si OK, o un mensaje de error si no.
 *
 * Usado por POST /api/quotations y /api/contracts para rechazar
 * payloads manipulados. Tolerancia 0.001 (≈ 0.1% del valorBien) para
 * permitir redondeos de cliente.
 */
export function validarDistribucion(args: {
  nivelRiesgo: NivelRiesgo;
  aporteInicialPct: number;
  enganchePct: number;
  depositoGarantiaPct: number;
  edicionManual: boolean;
}): string | null {
  // En edición manual, el operador puede capturar lo que quiera. Sólo
  // validamos que los números no sean negativos ni absurdos.
  if (args.edicionManual) {
    if (args.enganchePct < 0 || args.depositoGarantiaPct < 0) {
      return 'Enganche y depósito en garantía no pueden ser negativos';
    }
    if (args.enganchePct + args.depositoGarantiaPct > 1) {
      return 'La suma de enganche y depósito no puede exceder 100% del valor del bien';
    }
    return null;
  }

  // Modo automático: el server recalcula con la misma lib y verifica
  // que el cliente haya enviado los mismos números.
  const esperado = distribuirAporte(args.nivelRiesgo, args.aporteInicialPct);
  const tolerancia = 0.001;
  const dEng = Math.abs(esperado.enganchePct - args.enganchePct);
  const dDg  = Math.abs(esperado.depositoGarantiaPct - args.depositoGarantiaPct);
  if (dEng > tolerancia || dDg > tolerancia) {
    return (
      `Distribución incoherente con el nivel ${args.nivelRiesgo}: ` +
      `esperado enganche ${(esperado.enganchePct * 100).toFixed(2)}% / DG ${(esperado.depositoGarantiaPct * 100).toFixed(2)}%, ` +
      `recibido ${(args.enganchePct * 100).toFixed(2)}% / ${(args.depositoGarantiaPct * 100).toFixed(2)}%. ` +
      `Si fue intencional, marca "edición manual" en el cotizador.`
    );
  }
  return null;
}
