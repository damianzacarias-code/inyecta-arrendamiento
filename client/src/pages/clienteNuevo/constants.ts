// Catálogos compartidos por los pasos del wizard Nuevo Arrendatario.
// Aislamos las listas largas (estados, regímenes, géneros) aquí para
// no contaminar los componentes de UI.

export const ESTADOS_MX = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Coahuila',
  'Colima',
  'CDMX',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
] as const;

export const estadosOptions = ESTADOS_MX.map((e) => ({ value: e, label: e }));

export const estadoCivilOptions = [
  { value: 'SOLTERO', label: 'Soltero(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
] as const;

export const regimenMatrimonialOptions = [
  { value: 'SEPARACION_BIENES', label: 'Separación de bienes' },
  { value: 'SOCIEDAD_CONYUGAL', label: 'Sociedad conyugal' },
] as const;

export const generoOptions = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'OTRO', label: 'Otro' },
  { value: 'NO_ESPECIFICA', label: 'Prefiere no especificar' },
] as const;

export const situacionInstalacionesOptions = [
  { value: 'PROPIAS', label: 'Propias' },
  { value: 'RENTADAS', label: 'Rentadas' },
  { value: 'PAGANDOSE', label: 'Pagándose' },
  { value: 'FAMILIARES', label: 'Familiares' },
  { value: 'COMODATO', label: 'En comodato' },
  { value: 'HIPOTECADAS', label: 'Hipotecadas' },
] as const;

// Títulos + descripciones de los 4 pasos del wizard.
export const WIZARD_STEPS = [
  {
    key: 'identidad',
    title: 'Identidad',
    description: 'Datos del solicitante',
  },
  {
    key: 'domicilio',
    title: 'Domicilio',
    description: 'Fiscal y de operación',
  },
  {
    key: 'representante',
    title: 'Representante Legal',
    description: 'Apoderado legal',
  },
  {
    key: 'accionistas',
    title: 'Accionistas',
    description: 'Estructura accionaria',
  },
] as const;
