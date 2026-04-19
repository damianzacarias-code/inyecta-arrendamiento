/**
 * Design tokens para todos los PDFs generados (cotización, amortización).
 * Derivados de la paleta del logo Inyecta:
 *   #205878  marco del diamante  → primary dark
 *   #3080B0  texto "inyecta"     → primary / accent
 */

export const colors = {
  // Marca (logo)
  primary:      '#205878',
  primaryLight: '#3080B0',
  accent:       '#5A9ECC',

  // Encabezados / fila TOTAL — azul cyan medio del formato Excel original
  headerBg:    '#5C9BB8',
  headerText:  '#FFFFFF',
  totalBg:     '#5C9BB8',
  totalText:   '#FFFFFF',

  // Filas alternas zebra (azul muy claro)
  rowBand:     '#DAE7F0',
  rowBorder:   '#B8CEDD',

  // Texto
  text:        '#000000',
  textMuted:   '#444444',
  textLight:   '#9BA8B5',

  // Fondo / superficies
  bg:          '#FFFFFF',
  bgSoft:      '#F7FAFC',
  bgHighlight: '#EFF5FA',

  // Estados
  positive:    '#15803D',
  warning:     '#B45309',
  divider:     '#000000',

  // Compat (alias antiguo)
  rowAlt:      '#DAE7F0',
} as const;

export const fontSize = {
  xs:  7,
  sm:  8,
  md:  9,
  base:10,
  lg:  11,
  xl:  13,
  h2:  15,
  h1:  18,
} as const;

export const spacing = {
  xs:  2,
  sm:  4,
  md:  6,
  base:8,
  lg:  12,
  xl:  16,
  xxl: 24,
} as const;

export const radii = {
  sm: 2,
  md: 4,
  lg: 6,
} as const;

/** Formato de moneda MXN para PDFs (sin símbolo, con dos decimales y comas) */
export function fmtMoney(n: number): string {
  return n.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Igual que fmtMoney pero anteponiendo el símbolo $ */
export function fmtMoneySigned(n: number): string {
  return '$' + fmtMoney(n);
}

/** Formato de porcentaje "16%" o "16.5%" si tiene decimales */
export function fmtPct(n: number): string {
  const v = n * 100;
  return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)) + '%';
}
