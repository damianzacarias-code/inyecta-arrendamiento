/**
 * NoopEmailProvider — implementación por defecto.
 *
 * No envía nada al exterior. Loggea el evento al logger del módulo
 * y devuelve `{ ok: true }`. Este es el comportamiento seguro de
 * fábrica: en una instalación recién clonada (sin SMTP configurado)
 * el sistema funciona normalmente — las notificaciones in-app siguen
 * llegando vía la campana, y el email simplemente queda como TODO.
 *
 * Cuándo se activa:
 *   • EMAIL_PROVIDER no definido (default).
 *   • EMAIL_PROVIDER='NOOP' explícito (útil en tests/CI).
 *
 * El log es a nivel `debug` para no saturar producción cuando
 * alguien deja NOOP por error — un grep de "[email-noop]" sobre
 * los logs revela los emails que NO salieron.
 */
import { childLogger } from '../../lib/logger';
import type { EmailPayload, EmailProvider, EmailSendResult } from './types';

export class NoopEmailProvider implements EmailProvider {
  public readonly name = 'NOOP';
  private log = childLogger('email-noop');

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    const to = Array.isArray(payload.to) ? payload.to : [payload.to];
    this.log.debug(
      {
        to,
        subject: payload.subject,
        bytes: payload.text.length + (payload.html?.length ?? 0),
      },
      `[noop] email no enviado (provider deshabilitado): "${payload.subject}"`,
    );
    return {
      ok: true,
      provider: this.name,
      messageId: `noop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  }
}
