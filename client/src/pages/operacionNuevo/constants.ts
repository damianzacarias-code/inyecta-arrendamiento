// Catálogos compartidos por el wizard Nueva Operación.

export const montoRangoOptions = [
  { value: 'HASTA_50K', label: 'Hasta $50,000' },
  { value: 'ENTRE_50K_100K', label: 'Entre $50,000 y $100,000' },
  { value: 'MAS_100K', label: 'Más de $100,000' },
] as const;

export const frecuenciaOptions = [
  { value: 'DIARIA', label: 'Diaria' },
  { value: 'SEMANAL', label: 'Semanal' },
  { value: 'QUINCENAL', label: 'Quincenal' },
  { value: 'MENSUAL', label: 'Mensual' },
] as const;

export const numOpsRangoOptions = [
  { value: 'UNO_A_TREINTA', label: '1 a 30 operaciones' },
  { value: 'TREINTAIUNO_A_CINCUENTA', label: '31 a 50 operaciones' },
  { value: 'MAS_DE_CINCUENTA', label: 'Más de 50 operaciones' },
] as const;

export const pepTipoOptions = [
  { value: 'SOLICITANTE', label: 'El solicitante' },
  { value: 'PARIENTE', label: 'Un pariente del solicitante' },
  { value: 'SOCIO_ACCIONISTA', label: 'Un socio o accionista' },
] as const;

export const pepTipoLabels: Record<string, string> = {
  SOLICITANTE: 'Solicitante',
  PARIENTE: 'Pariente',
  SOCIO_ACCIONISTA: 'Socio / accionista',
};

export const productoOptions = [
  { value: 'PURO', label: 'Arrendamiento Puro' },
  { value: 'FINANCIERO', label: 'Arrendamiento Financiero' },
] as const;

export const nivelRiesgoOptions = [
  { value: 'A', label: 'A — Bajo riesgo' },
  { value: 'B', label: 'B — Riesgo medio' },
  { value: 'C', label: 'C — Riesgo alto' },
] as const;

export const bienEstadoOptions = [
  { value: 'Nuevo', label: 'Nuevo' },
  { value: 'Seminuevo', label: 'Seminuevo' },
] as const;

export const plazoOptions = [12, 18, 24, 30, 36, 42, 48].map((p) => ({
  value: String(p),
  label: `${p} meses`,
}));

/** Presets de negocio por nivel de riesgo (ver ContratoNuevo legacy). */
export const RISK_PRESETS: Record<string, { enganche: number; deposito: number }> = {
  A: { enganche: 0, deposito: 0.16 },
  B: { enganche: 0.1, deposito: 0.21 },
  C: { enganche: 0.2, deposito: 0.26 },
};

export const WIZARD_STEPS = [
  {
    key: 'operacion',
    title: 'Operación',
    description: 'Cliente, producto y bien',
  },
  {
    key: 'financiero',
    title: 'Financiero',
    description: 'Parámetros y solicitud',
  },
  {
    key: 'kyc',
    title: 'KYC',
    description: 'Perfil y declaraciones',
  },
  {
    key: 'avales',
    title: 'Avales',
    description: 'Obligados solidarios',
  },
] as const;
