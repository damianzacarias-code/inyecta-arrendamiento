/**
 * Tests del NoopEmailProvider — el default de fábrica.
 *
 * El noop debe:
 *   • resolver siempre con ok=true (no romper la cadena de notificación)
 *   • NUNCA hacer I/O al exterior (no es testeable directamente, pero
 *     verificamos que no requiere config de SMTP, no llama a fetch, etc.)
 *   • devolver un messageId estable (string no vacío) para tracing
 *   • exponer name='NOOP'
 *
 * También probamos el factory: getEmailProvider() devuelve la misma
 * instancia en llamadas sucesivas (singleton) y respeta el reset.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NoopEmailProvider } from '../NoopEmailProvider';
import { getEmailProvider, __resetEmailProviderForTests } from '../index';

describe('NoopEmailProvider', () => {
  it('expone name="NOOP"', () => {
    const provider = new NoopEmailProvider();
    expect(provider.name).toBe('NOOP');
  });

  it('resuelve con ok=true incluso con payload mínimo', async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.send({
      to: 'admin@inyecta.com.mx',
      subject: 'Solicitud nueva',
      text: 'Hay una solicitud que revisar.',
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('NOOP');
    expect(result.error).toBeUndefined();
  });

  it('genera un messageId distinto en cada envío', async () => {
    const provider = new NoopEmailProvider();
    const r1 = await provider.send({ to: 'a@x.com', subject: 's', text: 't' });
    const r2 = await provider.send({ to: 'b@x.com', subject: 's', text: 't' });
    expect(r1.messageId).toBeTruthy();
    expect(r2.messageId).toBeTruthy();
    expect(r1.messageId).not.toBe(r2.messageId);
    expect(r1.messageId).toMatch(/^noop-/);
  });

  it('acepta múltiples destinatarios sin diferenciar comportamiento', async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.send({
      to: ['a@inyecta.com.mx', 'b@inyecta.com.mx'],
      subject: 'aviso',
      text: 'cuerpo',
      html: '<p>cuerpo</p>',
    });
    expect(result.ok).toBe(true);
  });
});

describe('factory getEmailProvider', () => {
  beforeEach(() => {
    __resetEmailProviderForTests();
  });

  it('devuelve un NOOP cuando EMAIL_PROVIDER no está configurado (default)', () => {
    // En tests no hay EMAIL_PROVIDER en env → cae al default 'NOOP'.
    const provider = getEmailProvider();
    expect(provider.name).toBe('NOOP');
  });

  it('cachea la instancia (singleton)', () => {
    const a = getEmailProvider();
    const b = getEmailProvider();
    expect(a).toBe(b);
  });

  it('reset crea una nueva instancia', () => {
    const a = getEmailProvider();
    __resetEmailProviderForTests();
    const b = getEmailProvider();
    expect(a).not.toBe(b);
    // misma clase, distinta instancia.
    expect(a.name).toBe(b.name);
  });
});
