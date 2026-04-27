/**
 * uploadCipher.test.ts — Tests del cifrado AES-256-GCM de uploads
 * (CLAUDE.md §10 — Hardening S6).
 *
 * Cubre:
 *   • round-trip buffer (encrypt → decrypt = original)
 *   • magic / header inválidos rechazados
 *   • tampering del payload detectado por GCM auth tag
 *   • round-trip de archivo (encryptFileInPlace + decryptToStream)
 *   • plaintext borrado tras encrypt
 *   • resolveServingPath: prefiere .enc sobre plaintext
 *   • isEnabled: false sin master, true con master válida
 *   • master key inválida → throw helpful
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import {
  encryptBuffer,
  decryptBuffer,
  encryptFileInPlace,
  decryptToStream,
  resolveServingPath,
  isEnabled,
  getMasterKey,
  _resetMasterKeyCache,
} from '../uploadCipher';

// 32 bytes en base64 = 44 chars (con padding) — fija para los tests.
const TEST_MASTER_KEY_B64 = randomBytes(32).toString('base64');

beforeEach(() => {
  process.env.UPLOAD_MASTER_KEY = TEST_MASTER_KEY_B64;
  _resetMasterKeyCache();
});

afterEach(() => {
  delete process.env.UPLOAD_MASTER_KEY;
  _resetMasterKeyCache();
});

describe('isEnabled / getMasterKey', () => {
  it('isEnabled=true cuando UPLOAD_MASTER_KEY está set', () => {
    expect(isEnabled()).toBe(true);
  });

  it('isEnabled=false cuando no está set', () => {
    delete process.env.UPLOAD_MASTER_KEY;
    _resetMasterKeyCache();
    expect(isEnabled()).toBe(false);
  });

  it('throw si la key no es 32 bytes', () => {
    process.env.UPLOAD_MASTER_KEY = Buffer.from('short').toString('base64');
    _resetMasterKeyCache();
    expect(() => getMasterKey()).toThrow(/32 bytes/);
  });
});

describe('encryptBuffer / decryptBuffer', () => {
  it('round-trip preserva el contenido', () => {
    const original = Buffer.from('Documento confidencial PFAE — RFC: ABCD123456789');
    const enc = encryptBuffer(original);
    const dec = decryptBuffer(enc);
    expect(dec.equals(original)).toBe(true);
  });

  it('archivo binario grande (1MB) round-trip OK', () => {
    const original = randomBytes(1024 * 1024);
    const enc = encryptBuffer(original);
    const dec = decryptBuffer(enc);
    expect(dec.equals(original)).toBe(true);
  });

  it('cifrados consecutivos del mismo plaintext son distintos (IV random)', () => {
    const plain = Buffer.from('test');
    const a = encryptBuffer(plain);
    const b = encryptBuffer(plain);
    expect(a.equals(b)).toBe(false);
  });

  it('overhead = 92 bytes', () => {
    const plain = Buffer.from('hi');
    const enc = encryptBuffer(plain);
    expect(enc.length - plain.length).toBe(92);
  });

  it('rechaza envelope con magic incorrecto', () => {
    const enc = encryptBuffer(Buffer.from('hi'));
    enc[0] = 0; // corrompe magic
    expect(() => decryptBuffer(enc)).toThrow(/magic/);
  });

  it('rechaza envelope truncado', () => {
    expect(() => decryptBuffer(Buffer.alloc(10))).toThrow(/truncado/);
  });

  it('detecta tampering del payload (GCM auth tag)', () => {
    const enc = encryptBuffer(Buffer.from('confidencial'));
    // Flip un bit del payload (después del header de 92 bytes).
    enc[100] ^= 0x01;
    expect(() => decryptBuffer(enc)).toThrow();
  });

  it('detecta tampering del DEK auth tag', () => {
    const enc = encryptBuffer(Buffer.from('confidencial'));
    // El tag de la DEK está en bytes 16..32 (después de magic+IV).
    enc[20] ^= 0x01;
    expect(() => decryptBuffer(enc)).toThrow();
  });

  it('master key distinta no descifra', () => {
    const original = Buffer.from('test');
    const enc = encryptBuffer(original);
    process.env.UPLOAD_MASTER_KEY = randomBytes(32).toString('base64');
    _resetMasterKeyCache();
    expect(() => decryptBuffer(enc)).toThrow();
  });
});

describe('encryptFileInPlace + decryptToStream + resolveServingPath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uploadCipher-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('round-trip de archivo: cifra, descifra, plaintext borrado', async () => {
    const plainPath = path.join(tmpDir, 'doc.pdf');
    const original = randomBytes(8192);
    await fs.writeFile(plainPath, original);

    const encPath = await encryptFileInPlace(plainPath);
    expect(encPath).toBe(`${plainPath}.enc`);

    // El plaintext fue borrado.
    await expect(fs.access(plainPath)).rejects.toThrow();

    // El .enc existe.
    await expect(fs.access(encPath)).resolves.toBeUndefined();

    // Round-trip via stream.
    const stream = await decryptToStream(encPath);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(original)).toBe(true);
  });

  it('resolveServingPath prefiere .enc sobre plaintext', async () => {
    const plainPath = path.join(tmpDir, 'doc.pdf');
    await fs.writeFile(plainPath, 'plaintext');
    await fs.writeFile(`${plainPath}.enc`, 'encrypted');

    const r = await resolveServingPath(plainPath);
    expect(r).not.toBeNull();
    expect(r!.encrypted).toBe(true);
    expect(r!.path).toBe(`${plainPath}.enc`);
  });

  it('resolveServingPath con solo plaintext devuelve encrypted=false', async () => {
    const plainPath = path.join(tmpDir, 'legacy.pdf');
    await fs.writeFile(plainPath, 'legacy');

    const r = await resolveServingPath(plainPath);
    expect(r).not.toBeNull();
    expect(r!.encrypted).toBe(false);
    expect(r!.path).toBe(plainPath);
  });

  it('resolveServingPath con nada devuelve null', async () => {
    const missing = path.join(tmpDir, 'no-existe.pdf');
    expect(await resolveServingPath(missing)).toBeNull();
  });
});
