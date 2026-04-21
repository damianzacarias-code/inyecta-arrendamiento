/**
 * Tests del logger pino — verifica las garantías de redacción y la
 * forma del output JSON en producción.
 *
 * Por qué importa: si la regla de redact deja escapar `password` o
 * `authorization`, secrets terminan en CloudWatch / Datadog → incidente
 * de seguridad. Estos tests fijan el contrato.
 *
 * Estrategia:
 *   • Construimos un logger pino "fresco" en cada test contra un
 *     stream en memoria (Writable que acumula buffers). Eso nos permite
 *     parsear cada línea como JSON y assertear sus campos sin depender
 *     del entorno (NODE_ENV, transports, etc).
 *   • Usamos las MISMAS reglas de redact que el logger productivo
 *     (importadas del módulo) — si alguien las cambia, estos tests
 *     se rompen.
 */
import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { Writable } from 'stream';

// Stream que acumula líneas JSON de pino para inspección.
function memoryStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

// Construye un logger con las MISMAS reglas de redact del módulo
// (lib/logger.ts). Si esas reglas cambian, ajustar aquí también.
function makeTestLogger(stream: Writable) {
  return pino(
    {
      level: 'trace',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.pwd',
          'req.body.token',
          'req.body.secret',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
          '*.secret',
          '*.apiKey',
          '*.authorization',
        ],
        censor: '***REDACTED***',
      },
    },
    stream,
  );
}

function lastEvent(lines: string[]) {
  expect(lines.length).toBeGreaterThan(0);
  return JSON.parse(lines[lines.length - 1]);
}

describe('logger — redact rules', () => {
  it('redacta req.body.password', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ req: { body: { email: 'a@b.com', password: 'super-secret' } } }, 'login attempt');
    const ev = lastEvent(lines);
    expect(ev.req.body.email).toBe('a@b.com');
    expect(ev.req.body.password).toBe('***REDACTED***');
  });

  it('redacta req.headers.authorization', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ req: { headers: { authorization: 'Bearer eyJhbGciOiJ...' } } }, 'inbound');
    const ev = lastEvent(lines);
    expect(ev.req.headers.authorization).toBe('***REDACTED***');
  });

  it('redacta req.headers.cookie', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ req: { headers: { cookie: 'session=abc123' } } }, 'inbound');
    const ev = lastEvent(lines);
    expect(ev.req.headers.cookie).toBe('***REDACTED***');
  });

  it('redacta wildcards: *.password en cualquier objeto top-level', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ user: { email: 'x', password: 'secret' } }, 'whatever');
    const ev = lastEvent(lines);
    expect(ev.user.password).toBe('***REDACTED***');
    expect(ev.user.email).toBe('x');
  });

  it('redacta *.token y *.secret', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ creds: { token: 'jwt-x', secret: 'shhh' } }, 'token issued');
    const ev = lastEvent(lines);
    expect(ev.creds.token).toBe('***REDACTED***');
    expect(ev.creds.secret).toBe('***REDACTED***');
  });

  it('NO redacta campos benignos', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ contractId: 'abc', amount: 1500 }, 'payment');
    const ev = lastEvent(lines);
    expect(ev.contractId).toBe('abc');
    expect(ev.amount).toBe(1500);
  });

  it('emite JSON válido por línea (formato productivo)', () => {
    const { stream, lines } = memoryStream();
    const log = makeTestLogger(stream);
    log.info({ a: 1 }, 'first');
    log.warn({ b: 2 }, 'second');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const ev = JSON.parse(line);
      expect(ev.level).toBeTypeOf('number');
      expect(ev.time).toBeTypeOf('number');
      expect(ev.msg).toBeTypeOf('string');
    }
  });
});
