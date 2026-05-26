import { describe, it, expect } from 'vitest';
import { validarNombreVsCurp } from '../ineValidation';

describe('validarNombreVsCurp', () => {
  it('acepta un nombre que coincide con el CURP (caso titular Damián)', () => {
    const r = validarNombreVsCurp({
      nombre: 'DAMIÁN',
      apellidoPaterno: 'ZACARÍAS',
      apellidoMaterno: 'SANCHEZ',
      curp: 'ZASD010614HSPCNMA5',
    });
    expect(r.ok).toBe(true);
  });

  it('DETECTA el bug del aval: nombre y apellidos revueltos', () => {
    // Lo que Claude extrajo MAL para Maryelena Martinez Gonzalez:
    //   nombre="MARTINEZ GONZALEZ", paterno="MARVELENA", materno=""
    // CURP real: MAGM760322... → M(artinez) A G(onzalez) M(aryelena)
    const r = validarNombreVsCurp({
      nombre: 'MARTINEZ GONZALEZ',
      apellidoPaterno: 'MARVELENA',
      apellidoMaterno: '',
      curp: 'MAGM760322MWGNRR05',
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('CURP');
  });

  it('acepta el nombre CORRECTO del aval (parseo bien hecho)', () => {
    const r = validarNombreVsCurp({
      nombre: 'MARYELENA',
      apellidoPaterno: 'MARTINEZ',
      apellidoMaterno: 'GONZALEZ',
      curp: 'MAGM760322MWGNRR05',
    });
    expect(r.ok).toBe(true);
  });

  it('regla MARIA/JOSE: usa la inicial del segundo nombre', () => {
    // CURP de "María Guadalupe ..." usa la G de Guadalupe en pos 4.
    const r = validarNombreVsCurp({
      nombre: 'MARIA GUADALUPE',
      apellidoPaterno: 'LOPEZ',
      apellidoMaterno: 'PEREZ',
      curp: 'LOPG900101MDFXXX01', // L O P G
    });
    expect(r.ok).toBe(true);
  });

  it('acepta apellido con acento (normaliza diacríticos)', () => {
    const r = validarNombreVsCurp({
      nombre: 'ANGEL',
      apellidoPaterno: 'ÁNGELES',
      apellidoMaterno: 'NÚÑEZ',
      curp: 'AANA850101HDFXXX02', // A A N A
    });
    expect(r.ok).toBe(true);
  });

  it('materno ausente con CURP que marca X en pos 3 → ok', () => {
    const r = validarNombreVsCurp({
      nombre: 'JUAN',
      apellidoPaterno: 'PEREZ',
      apellidoMaterno: '',
      curp: 'PEXJ800101HDFXXX03', // P E X J — pos 3 = X (sin materno)
    });
    expect(r.ok).toBe(true);
  });

  it('inconcluso si no hay CURP (no se puede validar, no marca error)', () => {
    const r = validarNombreVsCurp({
      nombre: 'JUAN',
      apellidoPaterno: 'PEREZ',
      apellidoMaterno: 'LOPEZ',
      curp: null,
    });
    expect(r.ok).toBe(true);
    expect(r.inconcluso).toBe(true);
  });

  it('inconcluso si el CURP es muy corto', () => {
    const r = validarNombreVsCurp({
      nombre: 'JUAN',
      apellidoPaterno: 'PEREZ',
      curp: 'PE',
    });
    expect(r.ok).toBe(true);
    expect(r.inconcluso).toBe(true);
  });

  it('detecta paterno equivocado aunque nombre esté bien', () => {
    const r = validarNombreVsCurp({
      nombre: 'DAMIÁN',
      apellidoPaterno: 'GONZALEZ', // debería empezar con Z (Zacarías)
      apellidoMaterno: 'SANCHEZ',
      curp: 'ZASD010614HSPCNMA5',
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('paterno');
  });
});
