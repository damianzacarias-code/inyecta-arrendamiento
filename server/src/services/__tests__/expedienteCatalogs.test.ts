/**
 * Tests del catálogo de documentos del expediente.
 *
 * Cubren la ampliación del catálogo con los documentos que la
 * operación GENERA de forma natural (pagaré, carátula, tabla de
 * amortización, contratos GPS/proveedor, actas, CFDIs, etc.).
 *
 * REGLA DE NEGOCIO (Damián): todos los documentos generados se
 * agregan como OPCIONALES — deben aparecer en el catálogo pero NO
 * deben contar como faltantes en el % de cobertura del expediente.
 */
import { describe, it, expect } from 'vitest';
import {
  catalogoParaActor,
  calcularCobertura,
  type CatalogoDoc,
} from '../expedienteCatalogs';

// Tipos generados por la operación que se agregaron como opcionales.
const NUEVOS_BIEN_ARRENDADO = [
  'ENDOSO_POLIZA',
  'CONTRATO_GPS',
  'CONTRATO_PROVEEDOR',
  'FACTURA_VENTA',
  'ACTA_DEVOLUCION',
] as const;

const NUEVOS_FORMALIZACION = [
  'PAGARE',
  'CARATULA',
  'TABLA_AMORTIZACION',
  'ACTA_ENTREGA_RECEPCION',
  'CARTA_DOMICILIACION',
  'CFDI_RENTA',
  'RECIBO_PAGO',
  'ESTADO_CUENTA',
  'CARTA_FINIQUITO',
] as const;

const find = (cat: CatalogoDoc[], tipo: string) => cat.find(d => d.tipo === tipo);

describe('expedienteCatalogs — documentos generados por la operación', () => {
  it('BIEN_ARRENDADO incluye los nuevos tipos generados y todos son opcionales', () => {
    const cat = catalogoParaActor('PFAE', 'BIEN_ARRENDADO');
    for (const tipo of NUEVOS_BIEN_ARRENDADO) {
      const doc = find(cat, tipo);
      expect(doc, `falta ${tipo} en BIEN_ARRENDADO`).toBeDefined();
      expect(doc?.opcional, `${tipo} debe ser opcional`).toBe(true);
    }
  });

  it('FORMALIZACION incluye los nuevos tipos generados y todos son opcionales', () => {
    const cat = catalogoParaActor('PFAE', 'FORMALIZACION');
    for (const tipo of NUEVOS_FORMALIZACION) {
      const doc = find(cat, tipo);
      expect(doc, `falta ${tipo} en FORMALIZACION`).toBeDefined();
      expect(doc?.opcional, `${tipo} debe ser opcional`).toBe(true);
    }
  });

  it('los nuevos tipos también están presentes para titular PM', () => {
    const bien = catalogoParaActor('PM', 'BIEN_ARRENDADO');
    const form = catalogoParaActor('PM', 'FORMALIZACION');
    for (const tipo of NUEVOS_BIEN_ARRENDADO) {
      expect(find(bien, tipo)?.opcional).toBe(true);
    }
    for (const tipo of NUEVOS_FORMALIZACION) {
      expect(find(form, tipo)?.opcional).toBe(true);
    }
  });
});

describe('expedienteCatalogs — cobertura ignora documentos opcionales generados', () => {
  // FORMALIZACION tiene 3 requeridos: RESOLUCION, CONTRATO_Y_ANEXOS,
  // INSCRIPCION_RUG_O_RPP. Los nuevos generados son opcionales, así
  // que el total esperado de ese actor no debe cambiar.
  it('agregar docs opcionales generados NO cambia el total esperado', () => {
    const cobertura = calcularCobertura('PFAE', [
      { tipo: 'FORMALIZACION', documentos: [] },
    ]);
    // Sólo los 3 requeridos cuentan; ninguno de los 9 generados.
    expect(cobertura.esperados).toBe(3);
    expect(cobertura.digitalOk).toBe(0);
    expect(cobertura.porcentaje).toBe(0);
  });

  it('subir un doc generado opcional no eleva la cobertura por encima de los requeridos', () => {
    const cobertura = calcularCobertura('PFAE', [
      {
        tipo: 'FORMALIZACION',
        documentos: [
          { tipoDocumento: 'PAGARE', tieneDigital: true, tieneFisico: true },
        ],
      },
    ]);
    // El PAGARE es opcional: no suma a cubiertos.
    expect(cobertura.esperados).toBe(3);
    expect(cobertura.digitalOk).toBe(0);
  });

  it('BIEN_ARRENDADO: total esperado se mantiene en 8 requeridos pese a los generados', () => {
    // bienArrendado requeridos: FACTURA, VALIDACION_SELLOS, AVALUO,
    // POLIZA_SEGURO, PERMISOS_OPERACION, INSCRIPCION_RUG, REPUVE,
    // PAGO_DERECHOS_VEHICULARES = 8 (ANEXOS y los generados son opcionales).
    const cobertura = calcularCobertura('PFAE', [
      { tipo: 'BIEN_ARRENDADO', documentos: [] },
    ]);
    expect(cobertura.esperados).toBe(8);
  });
});
