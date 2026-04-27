/**
 * uploadCipher.verify.ts — Verificación end-to-end del cifrado de
 * uploads + el middleware encryptedStatic (CLAUDE.md §10 — S6).
 *
 * Levanta una mini-app, escribe archivos en disco (cifrado y
 * plaintext) y verifica que el GET los sirva correctamente.
 *
 * NO requiere BD ni Postgres. Comando: npm run verify:uploadCipher.
 */
import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

// Setear UPLOAD_MASTER_KEY ANTES de importar uploadCipher.
process.env.UPLOAD_MASTER_KEY = randomBytes(32).toString('base64');

// Los imports dinámicos viven dentro de main() para que tsconfig
// "module: commonjs" no falle con top-level await.
type CipherMod   = typeof import('../lib/uploadCipher');
type StaticMod   = typeof import('../middleware/encryptedStatic');
let cipher: CipherMod;
let staticMod: StaticMod;

interface CheckResult { name: string; ok: boolean; detail?: string }
const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const PORT = 40000 + Math.floor(Math.random() * 1000);
const HOST = `http://127.0.0.1:${PORT}`;

async function fetchPath(reqPath: string): Promise<{ status: number; body: Buffer }> {
  const res = await fetch(`${HOST}${reqPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: buf };
}

async function main() {
  console.log('\n=== uploadCipher — verificación end-to-end ===\n');

  cipher = await import('../lib/uploadCipher');
  staticMod = await import('../middleware/encryptedStatic');
  cipher._resetMasterKeyCache();

  const { encryptFileInPlace, isEnabled } = cipher;
  const { encryptedStatic } = staticMod;

  check('1. isEnabled() = true con UPLOAD_MASTER_KEY set', isEnabled());

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-uploadCipher-'));
  console.log(`  · tmp dir: ${tmpRoot}`);

  // Escribir un archivo plaintext y cifrarlo.
  const cifrado = path.join(tmpRoot, 'cifrado.pdf');
  const cifradoBytes = randomBytes(4096);
  await fs.writeFile(cifrado, cifradoBytes);
  await encryptFileInPlace(cifrado);

  // Y dejar otro como plaintext (legacy).
  const legacy = path.join(tmpRoot, 'legacy.pdf');
  const legacyBytes = randomBytes(2048);
  await fs.writeFile(legacy, legacyBytes);

  // Verificar disposición en disco.
  const cifradoExists = await fs.access(`${cifrado}.enc`).then(() => true).catch(() => false);
  const cifradoPlainGone = await fs.access(cifrado).then(() => false).catch(() => true);
  check('2. cifrado.pdf.enc existe en disco', cifradoExists);
  check('3. cifrado.pdf plaintext fue borrado', cifradoPlainGone);

  const legacyExists = await fs.access(legacy).then(() => true).catch(() => false);
  check('4. legacy.pdf plaintext intacto', legacyExists);

  // Header del .enc debe empezar con "INY1" (magic).
  const encContent = await fs.readFile(`${cifrado}.enc`);
  check('5. .enc empieza con magic "INY1"', encContent.subarray(0, 4).toString() === 'INY1');
  check(
    '6. .enc NO contiene el plaintext en claro',
    encContent.indexOf(cifradoBytes.subarray(0, 32)) === -1,
  );

  // Levantar la mini-app con encryptedStatic.
  const app = express();
  app.use('/uploads', encryptedStatic(tmpRoot));
  await new Promise<void>((resolve) => app.listen(PORT, resolve));

  // GET cifrado.pdf → 200 + plaintext + content-type.
  const r1 = await fetchPath('/uploads/cifrado.pdf');
  check('7. GET /uploads/cifrado.pdf → 200', r1.status === 200);
  check('8. respuesta es el plaintext original', r1.body.equals(cifradoBytes));

  // GET legacy.pdf → 200 + plaintext directo (express.static).
  const r2 = await fetchPath('/uploads/legacy.pdf');
  check('9. GET /uploads/legacy.pdf → 200', r2.status === 200);
  check('10. respuesta es el plaintext legacy', r2.body.equals(legacyBytes));

  // GET inexistente → 404.
  const r3 = await fetchPath('/uploads/no-existe.pdf');
  check('11. GET /uploads/no-existe.pdf → 404', r3.status === 404);

  // Path traversal → 403.
  const r4 = await fetchPath('/uploads/..%2F..%2Fetc%2Fpasswd');
  check(
    '12. path traversal rechazado (403 ó 404 — nunca 200)',
    r4.status === 403 || r4.status === 404,
    `status=${r4.status}`,
  );

  // Tampering: corrompemos el .enc en disco y reintentamos.
  const tampered = await fs.readFile(`${cifrado}.enc`);
  tampered[100] ^= 0xff; // flip un bit del payload
  await fs.writeFile(`${cifrado}.enc`, tampered);
  const r5 = await fetchPath('/uploads/cifrado.pdf');
  check(
    '13. archivo cifrado tampered → 500 (auth tag rechazo)',
    r5.status === 500,
    `status=${r5.status}`,
  );

  // Cleanup
  await fs.rm(tmpRoot, { recursive: true, force: true });

  const passed = results.filter((r) => r.ok).length;
  const total  = results.length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${passed}/${total} OK${passed === total ? ' ✓' : ' ✗'}`);
  if (passed !== total) {
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name} ${r.detail ?? ''}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
