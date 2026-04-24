/**
 * Tests de los mappers Solicitud → payload de API.
 *
 * Cubren los tres mappers exportados:
 *   • solicitudToClientPayload  → POST /api/clients
 *   • solicitudToContractPayload → POST /api/contracts
 *   • solicitudToAvalesPayloads  → POST /api/expediente/actores
 *
 * Y los enums helpers (estadoCivil/regimen/genero) que mapean
 * variantes libres del PDF a enums estrictos del backend.
 *
 * El cálculo financiero del payload de contrato delega en
 * calcularCotizacion() — verificado al centavo en
 * lib/cotizacion/__tests__/calculos.test.ts. Aquí solo verificamos
 * que el mapper invoque al motor con los inputs correctos y propague
 * los outputs canónicos al payload (no re-validamos la matemática).
 */
import { describe, it, expect } from 'vitest';
import {
  solicitudToClientPayload,
  solicitudToContractPayload,
  solicitudToAvalesPayloads,
  estadoCivilEnum,
  regimenMatrimonialEnum,
  generoEnum,
} from '../mappers';
import type { SolicitudData } from '../types';

// ─────────────────────────────────────────────────────────────
// solicitudToClientPayload
// ─────────────────────────────────────────────────────────────
describe('solicitudToClientPayload', () => {
  it('mapea PFAE con domicilio fiscal y limpia campos vacíos', () => {
    const s: SolicitudData = {
      tipoSolicitante: 'PFAE',
      solicitantePFAE: {
        nombre: 'Juan',
        apellidoPaterno: 'Pérez',
        apellidoMaterno: 'López',
        rfc: 'PELJ800101AAA',
        curp: 'PELJ800101HDFRPN09',
        email: 'juan@example.com',
        telefono: '5512345678',
        celular: '5598765432',
        actividad: 'Consultoría',
        giro: 'Servicios profesionales',
        antiguedadNegocio: '5 años',
        calle: 'Av. Reforma',
        numExterior: '123',
        numInterior: '', // vacío → debe omitirse
        colonia: 'Centro',
        municipio: 'Cuauhtémoc',
        ciudad: 'CDMX',
        estado: 'CDMX',
        codigoPostal: '06500',
      },
    };

    const out = solicitudToClientPayload(s);

    expect(out.tipo).toBe('PFAE');
    expect(out.nombre).toBe('Juan');
    expect(out.apellidoPaterno).toBe('Pérez');
    expect(out.apellidoMaterno).toBe('López');
    expect(out.rfc).toBe('PELJ800101AAA');
    expect(out.email).toBe('juan@example.com');
    // celular debe ir a telefonoOficina (regla del mapper)
    expect(out.telefonoOficina).toBe('5598765432');
    expect(out.actividadEconomica).toBe('Consultoría');
    expect(out.sector).toBe('Servicios profesionales');
    expect(out.anosAntiguedadActividad).toBe(5);
    expect(out.cp).toBe('06500');
    // numInterior vacío fue eliminado por clean()
    expect(out).not.toHaveProperty('numInterior');
    // País por defecto cuando no viene en el PDF
    expect(out.pais).toBe('México');
  });

  it('mapea PM con representante legal anidado y socio inicial', () => {
    const s: SolicitudData = {
      tipoSolicitante: 'PM',
      solicitantePM: {
        razonSocial: 'Acme S.A. de C.V.',
        rfc: 'ACM800101AAA',
        email: 'contacto@acme.com',
        capitalSocial: 1_000_000,
        sector: 'Industrial',
        actividad: 'Manufactura',
        calle: 'Industria',
        numExterior: '99',
        ciudad: 'Monterrey',
        estado: 'Nuevo León',
        codigoPostal: '64000',
      },
      representanteLegal: {
        nombre: 'María',
        apellidoPaterno: 'García',
        apellidoMaterno: 'Hernández',
        rfc: 'GAHM850202BBB',
        cargo: 'Directora General',
        numeroEscrituraPoder: '12345',
        fechaEscrituraPoder: '2020-01-15',
      },
    };

    const out = solicitudToClientPayload(s);

    expect(out.tipo).toBe('PM');
    expect(out.razonSocial).toBe('Acme S.A. de C.V.');
    expect(out.capitalSocial).toBe(1_000_000);
    expect(out.actividadEconomica).toBe('Manufactura');

    // Representante legal anidado
    const rl = out.representanteLegal as Record<string, unknown>;
    expect(rl).toBeDefined();
    expect(rl.nombre).toBe('María');
    expect(rl.ocupacion).toBe('Directora General');
    expect(rl.folioInscripcionPoderes).toBe('12345');
    expect(rl.fechaInscripcionPoderes).toBe('2020-01-15');

    // Socio inicial (rep legal con esRepLegal=true y porcentaje=100 placeholder)
    const socios = out.socios as Array<Record<string, unknown>>;
    expect(socios).toHaveLength(1);
    expect(socios[0].esRepLegal).toBe(true);
    expect(socios[0].porcentaje).toBe(100);
    expect(socios[0].nombre).toBe('María');
  });

  it('lanza si tipoSolicitante no es PFAE ni PM', () => {
    expect(() =>
      solicitudToClientPayload({ tipoSolicitante: null } as SolicitudData),
    ).toThrow(/PFAE o PM/);
  });

  it('PM sin representante legal NO incluye socios (no falla, deja al usuario)', () => {
    const s: SolicitudData = {
      tipoSolicitante: 'PM',
      solicitantePM: { razonSocial: 'Sin RL S.A.', rfc: 'SRL800101AAA' },
    };
    const out = solicitudToClientPayload(s);
    expect(out).not.toHaveProperty('socios');
    expect(out).not.toHaveProperty('representanteLegal');
  });
});

// ─────────────────────────────────────────────────────────────
// solicitudToContractPayload
// ─────────────────────────────────────────────────────────────
describe('solicitudToContractPayload', () => {
  const baseSolicitud: SolicitudData = {
    tipoSolicitante: 'PFAE',
    operacion: { tipoArrendamiento: 'FINANCIERO', plazoMeses: 48 },
    bien: {
      descripcion: 'Camioneta Ford F-150 2024',
      marca: 'Ford',
      modelo: 'F-150',
      anio: 2024,
      numSerie: 'VIN1234567',
      valorConIVA: 2_100_000,
      nuevo: true,
      proveedor: 'Ford México',
    },
  };

  it('genera payload con campos del bien y financieros del motor (PURO)', () => {
    const s = {
      ...baseSolicitud,
      operacion: { tipoArrendamiento: 'PURO' as const, plazoMeses: 48 },
    };
    const out = solicitudToContractPayload(s, { clientId: 'client-123' });

    expect(out.clientId).toBe('client-123');
    expect(out.producto).toBe('PURO');
    expect(out.plazo).toBe(48);
    expect(out.tasaAnual).toBe(0.36); // default Inyecta
    expect(out.nivelRiesgo).toBe('A'); // default
    expect(out.bienDescripcion).toBe('Camioneta Ford F-150 2024');
    expect(out.bienAnio).toBe(2024);
    expect(out.bienEstado).toBe('Nuevo');

    // Verificación al centavo del motor (caso PURO 48m, 36% anual,
    // valor $2.1M con IVA, GPS=0, sin seguro/enganche, comisión 5% fin):
    // valorBienSinIVA = 1,810,344.83
    expect(Number(out.valorBien)).toBeCloseTo(1_810_344.83, 1);

    // Renta neta debe estar definida y > 0 (la matemática se verifica
    // exhaustiva en calculos.test.ts)
    expect(Number(out.rentaMensual)).toBeGreaterThan(0);
    expect(Number(out.rentaMensualIVA)).toBeCloseTo(
      Number(out.rentaMensual) * 0.16,
      2,
    );
  });

  it('genera payload FINANCIERO con porcentaje residual 2%', () => {
    const out = solicitudToContractPayload(baseSolicitud, { clientId: 'c1' });
    expect(out.producto).toBe('FINANCIERO');
    // Para FINANCIERO el residual es 2% del valor sin IVA: ~36,206.90
    // (no se verifica al centavo aquí, se delega a calculos.test.ts).
    expect(Number(out.valorResidual)).toBeGreaterThan(0);
  });

  it('mapea perfil transaccional con rangos derivados de números', () => {
    const s: SolicitudData = {
      ...baseSolicitud,
      perfilTransaccional: {
        montoMensualOperaciones: 75_000,           // → ENTRE_50K_100K
        numeroOperacionesMensuales: 50,            // → TREINTA_A_CIEN
        origenRecursos: 'Operación del negocio',
        destinoRecursos: 'Capital de trabajo',
      },
    };
    const out = solicitudToContractPayload(s, { clientId: 'c1' });
    const pt = out.perfilTransaccional as Record<string, unknown>;
    expect(pt).toBeDefined();
    expect(pt.montoMensualRango).toBe('ENTRE_50K_100K');
    expect(pt.numOperacionesRango).toBe('TREINTA_A_CIEN');
    expect(pt.frecuencia).toBe('MENSUAL');
    expect(pt.origenRecursos).toBe('Operación del negocio');
  });

  it('mapea declaraciones PEP del solicitante y de familiar', () => {
    const s: SolicitudData = {
      ...baseSolicitud,
      pep: {
        esPEP: true,
        cargoPEP: 'Diputado federal',
        periodoPEP: '2018-2021',
        familiarPEP: true,
        nombreFamiliarPEP: 'Pedro Pérez',
        parentescoPEP: 'Hermano',
        cargoFamiliarPEP: 'Senador',
      },
    };
    const out = solicitudToContractPayload(s, { clientId: 'c1' });
    const decl = out.declaracionesPEP as Array<Record<string, unknown>>;
    expect(decl).toHaveLength(2);
    expect(decl[0].tipo).toBe('SOLICITANTE');
    expect(decl[0].esPep).toBe(true);
    expect(decl[1].tipo).toBe('PARIENTE');
    expect(decl[1].nombre).toBe('Pedro Pérez');
  });

  it('lanza si falta descripción del bien', () => {
    const s = { ...baseSolicitud, bien: { ...baseSolicitud.bien, descripcion: undefined } };
    expect(() => solicitudToContractPayload(s, { clientId: 'c1' })).toThrow(/descripción/);
  });

  it('lanza si falta valor con IVA', () => {
    const s = { ...baseSolicitud, bien: { ...baseSolicitud.bien, valorConIVA: 0 } };
    expect(() => solicitudToContractPayload(s, { clientId: 'c1' })).toThrow(/valor/);
  });

  it('lanza si plazo está fuera de [12, 48]', () => {
    const s = { ...baseSolicitud, operacion: { ...baseSolicitud.operacion, plazoMeses: 60 } };
    expect(() => solicitudToContractPayload(s, { clientId: 'c1' })).toThrow(/plazo/i);
  });

  it('omite proveedor si no viene', () => {
    const s = { ...baseSolicitud, bien: { ...baseSolicitud.bien, proveedor: undefined } };
    const out = solicitudToContractPayload(s, { clientId: 'c1' });
    expect(out).not.toHaveProperty('proveedor');
  });
});

// ─────────────────────────────────────────────────────────────
// solicitudToAvalesPayloads
// ─────────────────────────────────────────────────────────────
describe('solicitudToAvalesPayloads', () => {
  it('mapea obligados PFAE como subtipo PF con orden secuencial', () => {
    const s: SolicitudData = {
      tipoSolicitante: 'PFAE',
      obligadosSolidarios: [
        {
          tipo: 'PFAE',
          nombre: 'Carlos',
          apellidoPaterno: 'Ruiz',
          apellidoMaterno: 'Solís',
          rfc: 'RUSC800101AAA',
          relacion: 'Hermano',
          ingresoMensual: 50_000,
        },
        {
          tipo: 'PF',
          nombre: 'Laura',
          apellidoPaterno: 'Mejía',
          rfc: 'MELA850202BBB',
        },
      ],
    };
    const out = solicitudToAvalesPayloads(s, 'contract-X');

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      contractId: 'contract-X',
      tipo: 'AVAL',
      subtipo: 'PF',
      orden: 1,
      nombre: 'Carlos Ruiz Solís',
      rfc: 'RUSC800101AAA',
    });
    expect(out[0].datosAdicionales).toMatchObject({
      relacion: 'Hermano',
      ingresoMensual: 50_000,
    });
    expect(out[1].orden).toBe(2);
    expect(out[1].nombre).toBe('Laura Mejía');
  });

  it('mapea obligados PM como subtipo PM con razón social', () => {
    const s: SolicitudData = {
      tipoSolicitante: 'PM',
      obligadosSolidarios: [
        {
          tipo: 'PM',
          razonSocial: 'Avalista Corp S.A. de C.V.',
          rfc: 'ACO800101AAA',
        },
      ],
    };
    const out = solicitudToAvalesPayloads(s, 'contract-Y');
    expect(out).toHaveLength(1);
    expect(out[0].subtipo).toBe('PM');
    expect(out[0].nombre).toBe('Avalista Corp S.A. de C.V.');
  });

  it('descarta obligados sin nombre ni razón social', () => {
    const s: SolicitudData = {
      tipoSolicitante: 'PFAE',
      obligadosSolidarios: [
        { tipo: 'PFAE', rfc: 'RUSC800101AAA' }, // sin nombre → descartado
        { tipo: 'PFAE', nombre: 'Válido', apellidoPaterno: 'Apellido' },
      ],
    };
    const out = solicitudToAvalesPayloads(s, 'c1');
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe('Válido Apellido');
    expect(out[0].orden).toBe(2); // el orden refleja la posición original, no el filtrado
  });

  it('devuelve [] si no hay obligados', () => {
    const out = solicitudToAvalesPayloads({ tipoSolicitante: 'PFAE' }, 'c1');
    expect(out).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Helpers de enum (variantes libres → enum del backend)
// ─────────────────────────────────────────────────────────────
describe('estadoCivilEnum', () => {
  it('reconoce variantes comunes', () => {
    expect(estadoCivilEnum('Casado')).toBe('CASADO');
    expect(estadoCivilEnum('CASADA')).toBe('CASADO');
    expect(estadoCivilEnum('soltero')).toBe('SOLTERO');
    expect(estadoCivilEnum('Divorciada')).toBe('DIVORCIADO');
    expect(estadoCivilEnum('VIUDO')).toBe('VIUDO');
    expect(estadoCivilEnum('Concubinato')).toBe('UNION_LIBRE');
    // Nota: "Union libre" sin acento sí matchea (regex es /UNION/);
    // "Unión libre" con acento NO matchea — la normalización de
    // acentos queda como mejora futura del mapper. El test refleja
    // el comportamiento real, no el deseable.
    expect(estadoCivilEnum('Union libre')).toBe('UNION_LIBRE');
  });
  it('devuelve undefined para vacío o desconocido', () => {
    expect(estadoCivilEnum(null)).toBeUndefined();
    expect(estadoCivilEnum('')).toBeUndefined();
    expect(estadoCivilEnum('xyz')).toBeUndefined();
  });
});

describe('regimenMatrimonialEnum', () => {
  it('detecta sociedad y separación', () => {
    expect(regimenMatrimonialEnum('Sociedad Conyugal')).toBe('SOCIEDAD_CONYUGAL');
    expect(regimenMatrimonialEnum('separación de bienes')).toBe('SEPARACION_DE_BIENES');
  });
  it('devuelve undefined para vacío o desconocido', () => {
    expect(regimenMatrimonialEnum(null)).toBeUndefined();
    expect(regimenMatrimonialEnum('otro')).toBeUndefined();
  });
});

describe('generoEnum', () => {
  it('detecta H/M y palabras completas', () => {
    expect(generoEnum('H')).toBe('MASCULINO');
    expect(generoEnum('Masculino')).toBe('MASCULINO');
    expect(generoEnum('Hombre')).toBe('MASCULINO');
    expect(generoEnum('M')).toBe('FEMENINO');
    expect(generoEnum('Femenino')).toBe('FEMENINO');
    expect(generoEnum('Mujer')).toBe('FEMENINO');
  });
  it('devuelve undefined para vacío o desconocido', () => {
    expect(generoEnum(null)).toBeUndefined();
    expect(generoEnum('NA')).toBeUndefined();
  });
});
