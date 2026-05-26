/**
 * ineValidation.ts — Validación cruzada nombre ↔ CURP para extracciones
 * de INE (opción B del fix de orientación/parseo, 25-05-2026).
 *
 * El CURP mexicano (18 caracteres) codifica el nombre en sus primeras
 * 4 letras:
 *   pos 0 → primera letra del APELLIDO PATERNO
 *   pos 1 → primera vocal interna del APELLIDO PATERNO (afectada por la
 *           regla "antisonante": si el prefijo forma palabra altisonante,
 *           se reemplaza por X — por eso NO validamos esta posición)
 *   pos 2 → primera letra del APELLIDO MATERNO (X si no tiene materno)
 *   pos 3 → primera letra del PRIMER NOMBRE de pila
 *
 * Si la extracción de Claude parseó mal el nombre (p.ej. juntó dos
 * apellidos en "nombre", o invirtió paterno/nombre por una imagen
 * girada), las primeras letras NO coincidirán con el CURP y lo
 * detectamos aquí — red de seguridad determinista, sin depender de que
 * el modelo se autocorrija.
 *
 * Función PURA — sin Prisma, sin I/O. Testeable en aislamiento.
 */

/** Quita acentos, pasa a mayúsculas, deja solo A-Z. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacríticos
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * Primera letra "de pila" considerando la regla CURP: si el primer
 * nombre es MARIA o JOSE (muy comunes) y hay un segundo nombre, el CURP
 * usa la inicial del SEGUNDO nombre. Ej: "MARIA GUADALUPE" → 'G'.
 */
function inicialNombrePila(nombre: string): string[] {
  const partes = nombre.trim().split(/\s+/).filter(Boolean).map(normalizar).filter(Boolean);
  if (partes.length === 0) return [];
  const candidatos = new Set<string>();
  candidatos.add(partes[0][0]);
  // Regla MARIA/JOSE: aceptar también la inicial del segundo nombre.
  if ((partes[0] === 'MARIA' || partes[0] === 'MA' || partes[0] === 'JOSE' || partes[0] === 'J') && partes[1]) {
    candidatos.add(partes[1][0]);
  }
  return [...candidatos];
}

export interface IneNombreData {
  nombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  curp?: string | null;
}

export interface IneValidationResult {
  /** true si el nombre coincide con el CURP (o no hay datos para validar). */
  ok: boolean;
  /** Mensaje legible cuando ok=false. */
  motivo?: string;
  /** true si no se pudo validar (faltan datos) — distinto de un mismatch. */
  inconcluso?: boolean;
}

/**
 * Valida que apellidoPaterno / apellidoMaterno / nombre coincidan con
 * las primeras letras del CURP. Devuelve ok=true si todo cuadra o si
 * faltan datos para validar (inconcluso). ok=false sólo cuando hay
 * contradicción explícita.
 */
export function validarNombreVsCurp(data: IneNombreData): IneValidationResult {
  const curp = (data.curp ?? '').trim().toUpperCase();
  // Sin CURP (o muy corto) no podemos validar.
  if (curp.length < 4) return { ok: true, inconcluso: true };

  const curpPaterno = curp[0];
  const curpMaterno = curp[2];
  const curpNombre = curp[3];

  const paterno = normalizar(data.apellidoPaterno ?? '');
  const materno = normalizar(data.apellidoMaterno ?? '');
  const nombre = (data.nombre ?? '').trim();

  // Si no hay ni nombre ni paterno, no hay qué validar.
  if (!paterno && !nombre) return { ok: true, inconcluso: true };

  const fallas: string[] = [];

  if (paterno && paterno[0] !== curpPaterno) {
    fallas.push(`apellido paterno "${data.apellidoPaterno}" debería empezar con "${curpPaterno}" (según CURP)`);
  }

  // Materno presente: validar primera letra (si el CURP no marca 'X').
  if (materno && curpMaterno !== 'X' && materno[0] !== curpMaterno) {
    fallas.push(`apellido materno "${data.apellidoMaterno}" debería empezar con "${curpMaterno}" (según CURP)`);
  }
  // Materno AUSENTE pero el CURP indica que SÍ existe (pos 2 ≠ 'X'):
  // la extracción perdió el segundo apellido. Señal fuerte de parseo
  // mal hecho (justo el bug del aval: materno vacío, CURP decía 'G').
  if (!materno && curpMaterno !== 'X') {
    fallas.push(`falta el apellido materno; el CURP indica que empieza con "${curpMaterno}"`);
  }

  if (nombre) {
    const inicialesValidas = inicialNombrePila(nombre);
    if (inicialesValidas.length > 0 && !inicialesValidas.includes(curpNombre)) {
      fallas.push(`nombre "${nombre}" debería empezar con "${curpNombre}" (según CURP)`);
    }
  }

  if (fallas.length === 0) return { ok: true };

  return {
    ok: false,
    motivo: `El nombre extraído no coincide con el CURP: ${fallas.join('; ')}. Verifica manualmente.`,
  };
}
