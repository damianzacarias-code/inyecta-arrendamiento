/**
 * mfa.test.ts — Tests unitarios puros del módulo MFA. No tocan BD;
 * solo validan los helpers que no dependen de Prisma.
 */
import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { generateBackupCodes, normalizeBackupCode, BACKUP_CODE_COUNT } from '../mfa';

describe('generateBackupCodes', () => {
  it('devuelve N codes', () => {
    expect(generateBackupCodes(5).length).toBe(5);
    expect(generateBackupCodes(BACKUP_CODE_COUNT).length).toBe(BACKUP_CODE_COUNT);
  });

  it('formato XXXX-XXXX hex mayúsculas', () => {
    const codes = generateBackupCodes(20);
    for (const c of codes) {
      expect(c).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    }
  });

  it('codes son únicos (probabilidad de colisión despreciable)', () => {
    const codes = generateBackupCodes(50);
    expect(new Set(codes).size).toBe(50);
  });
});

describe('normalizeBackupCode', () => {
  it('quita guiones y espacios', () => {
    expect(normalizeBackupCode('AB12-CD34')).toBe('AB12CD34');
    expect(normalizeBackupCode('AB12 CD34')).toBe('AB12CD34');
    expect(normalizeBackupCode(' AB12 CD34 ')).toBe('AB12CD34');
    expect(normalizeBackupCode('AB12-CD34\n')).toBe('AB12CD34');
  });

  it('uppercase', () => {
    expect(normalizeBackupCode('ab12cd34')).toBe('AB12CD34');
    expect(normalizeBackupCode('Ab12-Cd34')).toBe('AB12CD34');
  });

  it('idempotente', () => {
    expect(normalizeBackupCode(normalizeBackupCode('ab12-cd34')))
      .toBe(normalizeBackupCode('ab12-cd34'));
  });
});

describe('TOTP authenticator (otplib)', () => {
  it('genera y valida un token con el mismo secret', () => {
    const secret = authenticator.generateSecret();
    const token = authenticator.generate(secret);
    expect(authenticator.check(token, secret)).toBe(true);
  });

  it('rechaza token con secret distinto', () => {
    const secretA = authenticator.generateSecret();
    const secretB = authenticator.generateSecret();
    const token = authenticator.generate(secretA);
    expect(authenticator.check(token, secretB)).toBe(false);
  });

  it('keyuri produce otpauth:// con issuer y label', () => {
    const uri = authenticator.keyuri('user@x.com', 'Inyecta', 'BASE32SECRET234');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('Inyecta');
    // El @ se URL-encodea como %40 en el label.
    expect(uri).toContain('user%40x.com');
  });
});
