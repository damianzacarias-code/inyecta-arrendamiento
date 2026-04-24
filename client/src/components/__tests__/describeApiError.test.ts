/**
 * Tests para describeApiError — helper exportado por LoadErrorState.tsx
 * que convierte errores crudos de axios (o desconocidos) en mensajes
 * legibles en español.
 *
 * Por qué importa: este helper se usa en 7+ páginas (Contratos, Clientes,
 * Cotizaciones, CotizacionDetalle, Cobranza, ContratoDetalle, Documentos)
 * para alimentar el componente LoadErrorState. Si su mapping de status
 * codes a mensajes se rompe, todas esas páginas mostrarían "[object Object]"
 * o el stack crudo al usuario.
 *
 * Nota sobre alcance: testear el componente LoadErrorState (JSX) requeriría
 * @testing-library/react, que no está instalado y no podemos agregar
 * dependencias sin autorización explícita. Aquí cubrimos la lógica pura.
 */
import { describe, it, expect } from 'vitest';
import { describeApiError } from '@/components/LoadErrorState';

describe('describeApiError', () => {
  describe('mapeo por status HTTP', () => {
    it('401 → mensaje de permisos', () => {
      const err = { response: { status: 401, data: {} } };
      expect(describeApiError(err)).toBe('No tienes permisos para ver esta información.');
    });

    it('403 → mismo mensaje de permisos que 401', () => {
      const err = { response: { status: 403, data: {} } };
      expect(describeApiError(err)).toBe('No tienes permisos para ver esta información.');
    });

    it('404 → mensaje de recurso no encontrado', () => {
      const err = { response: { status: 404, data: {} } };
      expect(describeApiError(err)).toBe('El recurso no existe o fue eliminado.');
    });

    it('500 → mensaje de error de servidor con código', () => {
      const err = { response: { status: 500, data: {} } };
      expect(describeApiError(err)).toBe('Error del servidor (500).');
    });

    it('503 → también es 5xx, mismo formato', () => {
      const err = { response: { status: 503, data: {} } };
      expect(describeApiError(err)).toBe('Error del servidor (503).');
    });

    it('5xx con detalle del backend → lo concatena', () => {
      const err = {
        response: {
          status: 500,
          data: { error: 'Database connection lost' },
        },
      };
      expect(describeApiError(err)).toBe('Error del servidor (500): Database connection lost');
    });

    it('5xx con detalle como objeto { message } → extrae message', () => {
      const err = {
        response: {
          status: 502,
          data: { error: { message: 'Upstream timeout' } },
        },
      };
      expect(describeApiError(err)).toBe('Error del servidor (502): Upstream timeout');
    });
  });

  describe('cuerpo de error sin status conocido', () => {
    it('400 con error string → devuelve el detail tal cual', () => {
      const err = {
        response: {
          status: 400,
          data: { error: 'El campo RFC es inválido' },
        },
      };
      expect(describeApiError(err)).toBe('El campo RFC es inválido');
    });

    it('422 con error.message → devuelve el message', () => {
      const err = {
        response: {
          status: 422,
          data: { error: { message: 'Validación falló' } },
        },
      };
      expect(describeApiError(err)).toBe('Validación falló');
    });

    it('sin response pero con .message → devuelve message', () => {
      const err = { message: 'Network Error' };
      expect(describeApiError(err)).toBe('Network Error');
    });
  });

  describe('fallbacks defensivos', () => {
    it('error completamente vacío → mensaje genérico', () => {
      expect(describeApiError({})).toBe('Error desconocido al contactar el servidor.');
    });

    it('null → mensaje genérico (no truena)', () => {
      // El cast es legítimo: la firma es (err: unknown) y la implementación
      // hace `(err as ...)` defensivamente. Verificamos que no truene.
      expect(describeApiError(null as unknown)).toBe('Error desconocido al contactar el servidor.');
    });

    it('undefined → mensaje genérico (no truena)', () => {
      expect(describeApiError(undefined as unknown)).toBe('Error desconocido al contactar el servidor.');
    });

    it('string crudo (no axios) → mensaje genérico', () => {
      // Los catches de axios no devuelven strings, pero protegemos contra
      // cualquier throw raro.
      expect(describeApiError('algo')).toBe('Error desconocido al contactar el servidor.');
    });
  });

  describe('precedencia entre status y detail', () => {
    it('401 con detalle del backend → ignora el detalle, prioriza permisos', () => {
      // Decisión de diseño: para 401/403, el mensaje de permisos es más
      // útil al usuario que la respuesta cruda del backend.
      const err = {
        response: {
          status: 401,
          data: { error: 'JWT expired' },
        },
      };
      expect(describeApiError(err)).toBe('No tienes permisos para ver esta información.');
    });

    it('404 con detalle del backend → ignora el detalle', () => {
      const err = {
        response: {
          status: 404,
          data: { error: 'Cliente con ID xyz no existe' },
        },
      };
      expect(describeApiError(err)).toBe('El recurso no existe o fue eliminado.');
    });

    it('detail string toma precedencia sobre .message para errores no-status', () => {
      const err = {
        response: { status: 400, data: { error: 'Validación específica' } },
        message: 'Request failed with status code 400',
      };
      expect(describeApiError(err)).toBe('Validación específica');
    });
  });
});
