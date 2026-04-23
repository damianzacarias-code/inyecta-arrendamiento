/**
 * Tests del middleware upload.
 *
 * Casos cubiertos:
 *   • Acepta PDF dentro del límite de tamaño.
 *   • Rechaza extensión no permitida (.exe) → FILE_TYPE_INVALID 400.
 *   • Rechaza mimetype no permitido aun con extensión válida.
 *   • Rechaza archivo > 10MB → FILE_TOO_LARGE 400.
 *   • Errores se propagan al errorHandler global con formato estándar
 *     `{ error: { code, message, details? } }`.
 *
 * No tocan BD. Se monta un express mínimo solo con upload + errorHandler.
 */
import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { uploadCliente, MAX_FILE_BYTES } from '../upload';
import { errorHandler } from '../errorHandler';

function makeApp() {
  const app = express();
  app.post('/upload', uploadCliente, (req, res) => {
    res.json({
      ok: true,
      filename: req.file?.filename,
      size: req.file?.size,
    });
  });
  app.use(errorHandler);
  return app;
}

// Cleanup de archivos subidos durante los tests (los exitosos quedan
// en uploads/clientes; los rechazados ni siquiera se escriben).
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', '..', 'uploads', 'clientes');

afterAll(() => {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    // Borramos solo los que claramente vienen del test (timestamp + rand + nombre dummy).
    if (f.includes('test-upload-') || f.includes('test-too-big-')) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch (_) { /* ignore */ }
    }
  }
});

describe('upload middleware', () => {
  it('acepta un PDF dentro del límite', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/upload')
      .attach('archivo', Buffer.from('%PDF-1.4 contenido de prueba'), {
        filename: 'test-upload-ok.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.filename).toMatch(/test-upload-ok\.pdf$/);
  });

  it('rechaza extensión no permitida (.exe) con FILE_TYPE_INVALID', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/upload')
      .attach('archivo', Buffer.from('contenido'), {
        filename: 'test-upload-malicioso.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('FILE_TYPE_INVALID');
    expect(res.body.error?.message).toContain('.exe');
  });

  it('rechaza mimetype prohibido aunque la extensión sea .pdf', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/upload')
      .attach('archivo', Buffer.from('contenido'), {
        filename: 'test-upload-spoof.pdf',
        contentType: 'image/svg+xml',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('FILE_TYPE_INVALID');
    expect(res.body.error?.message).toContain('image/svg+xml');
  });

  it('rechaza archivo > 10 MB con FILE_TOO_LARGE', async () => {
    const app = makeApp();
    // Buffer ligeramente mayor al límite (10MB + 1KB).
    const big = Buffer.alloc(MAX_FILE_BYTES + 1024, 0x41);
    const res = await request(app)
      .post('/upload')
      .attach('archivo', big, {
        filename: 'test-too-big-large.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('FILE_TOO_LARGE');
    expect(res.body.error?.details?.maxBytes).toBe(MAX_FILE_BYTES);
  });
});
