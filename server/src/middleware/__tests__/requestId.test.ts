/**
 * Tests del middleware requestId.
 *
 * Casos cubiertos:
 *   • Genera UUID v4 si no hay header inbound.
 *   • Respeta header inbound válido (caso típico cuando un proxy lo pone).
 *   • Rechaza header inbound con caracteres peligrosos (inyección de
 *     CRLF / `;` / espacios) y genera UUID limpio.
 *   • Rechaza header inbound demasiado largo (>200 chars).
 *   • Echo en `X-Request-ID` del response.
 *   • Si llegan múltiples valores (array), usa el primero.
 */
import { describe, it, expect } from 'vitest';
import { requestId } from '../requestId';
import type { Request, Response } from 'express';

interface MockReq {
  headers: Record<string, string | string[] | undefined>;
  id?: string;
}

interface MockRes {
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
}

function mockReq(headers: Record<string, string | string[] | undefined> = {}): MockReq {
  return { headers };
}

function mockRes(): MockRes {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = String(value);
    },
  };
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function run(req: MockReq, res: MockRes) {
  return new Promise<void>((resolve) => {
    requestId()(req as unknown as Request, res as unknown as Response, () => resolve());
  });
}

describe('requestId middleware', () => {
  it('genera UUID v4 cuando no hay X-Request-ID inbound', async () => {
    const req = mockReq();
    const res = mockRes();
    await run(req, res);
    expect(req.id).toBeDefined();
    expect(req.id!).toMatch(UUID_V4);
    expect(res.headers['X-Request-ID']).toBe(req.id);
  });

  it('respeta el X-Request-ID inbound si es válido', async () => {
    const req = mockReq({ 'x-request-id': 'trace-abc-123' });
    const res = mockRes();
    await run(req, res);
    expect(req.id).toBe('trace-abc-123');
    expect(res.headers['X-Request-ID']).toBe('trace-abc-123');
  });

  it('acepta UUIDs y ULIDs como inbound (caracteres seguros)', async () => {
    const examples = [
      '550e8400-e29b-41d4-a716-446655440000',
      '01HF8K3Q4M5N6P7R8S9T0V1W2X',
      'simple-id_with-allowed.chars',
      'trace:01:abc',
    ];
    for (const ex of examples) {
      const req = mockReq({ 'x-request-id': ex });
      const res = mockRes();
      await run(req, res);
      expect(req.id).toBe(ex);
    }
  });

  it.each([
    'has space',
    'has;semicolon',
    'has=equals',
    'crlf\r\ninjected',
    'tab\there',
    'utf-8-✓',
    '<script>',
  ])('rechaza inbound peligroso "%s" y genera UUID', async (bad) => {
    const req = mockReq({ 'x-request-id': bad });
    const res = mockRes();
    await run(req, res);
    expect(req.id).not.toBe(bad);
    expect(req.id!).toMatch(UUID_V4);
  });

  it('rechaza inbound > 200 chars', async () => {
    const tooLong = 'a'.repeat(201);
    const req = mockReq({ 'x-request-id': tooLong });
    const res = mockRes();
    await run(req, res);
    expect(req.id).not.toBe(tooLong);
    expect(req.id!).toMatch(UUID_V4);
  });

  it('si llegan múltiples valores (array), usa el primero', async () => {
    const req = mockReq({ 'x-request-id': ['first-trace', 'second-trace'] });
    const res = mockRes();
    await run(req, res);
    expect(req.id).toBe('first-trace');
  });

  it('siempre escribe X-Request-ID en el response', async () => {
    const req = mockReq();
    const res = mockRes();
    await run(req, res);
    expect(res.headers['X-Request-ID']).toBeDefined();
    expect(res.headers['X-Request-ID']).toBe(req.id);
  });
});
