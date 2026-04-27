/**
 * uploadCipher.ts — Cifrado en reposo de archivos subidos
 * --------------------------------------------------------------
 * CLAUDE.md §10 — Hardening de seguridad S6.
 *
 * Esquema:
 *   - AES-256-GCM (autenticado: detecta tampering).
 *   - Master key de 32 bytes en env UPLOAD_MASTER_KEY (base64).
 *   - Cada archivo lleva su propia DEK (data encryption key) cifrada
 *     con la master via key wrapping (también AES-256-GCM). Esto
 *     permite rotar la master sin re-cifrar todos los archivos: solo
 *     re-cifras las DEKs.
 *
 * Layout en disco (.enc) — todo little-endian / network order:
 *   [4 bytes]  magic "INY1" (versionable)
 *   [12 bytes] IV de la DEK con la master (random)
 *   [16 bytes] auth tag de la DEK
 *   [32 bytes] DEK cifrada con master
 *   [12 bytes] IV del payload con la DEK (random)
 *   [16 bytes] auth tag del payload
 *   [N bytes]  ciphertext del payload
 *
 * Total overhead = 92 bytes / archivo. Para PDFs de 1MB+ es < 0.01%.
 *
 * Si UPLOAD_MASTER_KEY no está set → todas las funciones devuelven
 * isEnabled()=false y los handlers caen al modo plaintext (compat
 * con los archivos pre-S6).
 */
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  type CipherGCM,
  type DecipherGCM,
} from 'crypto';
import { promises as fs } from 'fs';
import { Readable } from 'stream';

const MAGIC = Buffer.from('INY1', 'utf8');
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;       // GCM standard
const TAG_LEN = 16;      // GCM standard
const KEY_LEN = 32;      // 256 bits
const HEADER_LEN = MAGIC.length + IV_LEN + TAG_LEN + KEY_LEN + IV_LEN + TAG_LEN; // = 92

let cachedMasterKey: Buffer | null | undefined;

/**
 * Lee la master key del env. Memoizada (es la única operación de boot
 * que toca process.env). Devuelve null si no está configurada — los
 * llamadores entonces caen al modo plaintext.
 */
export function getMasterKey(): Buffer | null {
  if (cachedMasterKey !== undefined) return cachedMasterKey;
  const raw = process.env.UPLOAD_MASTER_KEY;
  if (!raw) {
    cachedMasterKey = null;
    return null;
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('UPLOAD_MASTER_KEY no es base64 válido');
  }
  if (key.length !== KEY_LEN) {
    throw new Error(
      `UPLOAD_MASTER_KEY debe ser 32 bytes (got ${key.length}). Genera con: openssl rand -base64 32`,
    );
  }
  cachedMasterKey = key;
  return key;
}

export function isEnabled(): boolean {
  return getMasterKey() !== null;
}

/** Para tests: invalida el cache. */
export function _resetMasterKeyCache(): void {
  cachedMasterKey = undefined;
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────

/**
 * encryptBuffer — cifra un buffer en memoria. Útil para testing y
 * para uploads pequeños. Para archivos grandes preferir
 * encryptFileInPlace que opera vía streams.
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const master = getMasterKey();
  if (!master) throw new Error('UPLOAD_MASTER_KEY no configurada');

  // 1. Generar DEK aleatoria (32 bytes).
  const dek = randomBytes(KEY_LEN);

  // 2. Cifrar la DEK con la master.
  const dekIv = randomBytes(IV_LEN);
  const dekCipher = createCipheriv(ALGO, master, dekIv) as CipherGCM;
  const dekCt = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  // 3. Cifrar el payload con la DEK.
  const payIv = randomBytes(IV_LEN);
  const payCipher = createCipheriv(ALGO, dek, payIv) as CipherGCM;
  const payCt = Buffer.concat([payCipher.update(plaintext), payCipher.final()]);
  const payTag = payCipher.getAuthTag();

  return Buffer.concat([
    MAGIC,    // 4
    dekIv,    // 12
    dekTag,   // 16
    dekCt,    // 32
    payIv,    // 12
    payTag,   // 16
    payCt,    // N
  ]);
}

/**
 * decryptBuffer — inversa de encryptBuffer. Lanza si el magic no
 * coincide o si los auth tags no validan (tampering).
 */
export function decryptBuffer(envelope: Buffer): Buffer {
  const master = getMasterKey();
  if (!master) throw new Error('UPLOAD_MASTER_KEY no configurada');
  if (envelope.length < HEADER_LEN) {
    throw new Error('archivo cifrado truncado');
  }
  let off = 0;
  const magic = envelope.subarray(off, off += MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error('magic inválido — el archivo no está cifrado por este sistema');
  }
  const dekIv  = envelope.subarray(off, off += IV_LEN);
  const dekTag = envelope.subarray(off, off += TAG_LEN);
  const dekCt  = envelope.subarray(off, off += KEY_LEN);
  const payIv  = envelope.subarray(off, off += IV_LEN);
  const payTag = envelope.subarray(off, off += TAG_LEN);
  const payCt  = envelope.subarray(off);

  // Descifrar DEK.
  const dekDec = createDecipheriv(ALGO, master, dekIv) as DecipherGCM;
  dekDec.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDec.update(dekCt), dekDec.final()]);

  // Descifrar payload.
  const payDec = createDecipheriv(ALGO, dek, payIv) as DecipherGCM;
  payDec.setAuthTag(payTag);
  return Buffer.concat([payDec.update(payCt), payDec.final()]);
}

/**
 * encryptFileInPlace — lee un archivo plaintext, lo cifra y reescribe
 * a `<path>.enc` con permisos 600, y borra el plaintext original. Si
 * algo falla, deja el plaintext intacto y limpia el .enc parcial.
 *
 * Async / no-stream — para 10MB max es trivial. Si en el futuro
 * subimos el límite a >50MB conviene pasar a streams encadenados.
 */
export async function encryptFileInPlace(plaintextPath: string): Promise<string> {
  const encPath = `${plaintextPath}.enc`;
  let plain: Buffer;
  try {
    plain = await fs.readFile(plaintextPath);
  } catch (err) {
    throw new Error(`encryptFileInPlace: no pude leer ${plaintextPath}: ${(err as Error).message}`);
  }

  const enc = encryptBuffer(plain);

  try {
    await fs.writeFile(encPath, enc, { mode: 0o600 });
  } catch (err) {
    // Mejor esfuerzo de limpieza del .enc a medio escribir.
    await fs.unlink(encPath).catch(() => {});
    throw new Error(`encryptFileInPlace: no pude escribir ${encPath}: ${(err as Error).message}`);
  }

  // Solo borramos el plaintext después de confirmar la escritura del
  // .enc. Si el unlink falla, el archivo cifrado ya existe y el
  // sistema funciona — el plaintext queda como artefacto a limpiar.
  await fs.unlink(plaintextPath).catch(() => {});

  return encPath;
}

/**
 * decryptToStream — devuelve un Readable con el plaintext de un
 * archivo cifrado. Útil para responder un download sin materializar
 * el plaintext en disco.
 *
 * Implementación: lee + descifra a Buffer, devuelve Readable.from()
 * (memory-bound al tamaño del archivo, OK para nuestros 10MB max).
 */
export async function decryptToStream(encPath: string): Promise<Readable> {
  const envelope = await fs.readFile(encPath);
  const plain = decryptBuffer(envelope);
  return Readable.from(plain);
}

/**
 * resolveServingPath — dado el path "deseado" (ej.
 * /uploads/expedientes/abc.pdf), devuelve qué archivo realmente leer
 * y si está cifrado.
 *
 * Reglas:
 *   - Si existe `<path>.enc` → cifrado.
 *   - Si existe `<path>` plaintext → legacy.
 *   - Si no existe nada → null.
 */
export async function resolveServingPath(absPath: string): Promise<
  { path: string; encrypted: boolean } | null
> {
  // Preferimos cifrado si ambos existen (caso edge: archivo recién
  // cifrado pero el plaintext aún no se borró por alguna razón).
  try {
    await fs.access(`${absPath}.enc`);
    return { path: `${absPath}.enc`, encrypted: true };
  } catch { /* no .enc */ }
  try {
    await fs.access(absPath);
    return { path: absPath, encrypted: false };
  } catch { /* no plaintext */ }
  return null;
}
