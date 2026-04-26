/**
 * SendGridEmailProvider — stub explícito.
 *
 * Mismo patrón que SwSapienProvider en cfdiProvider.ts: el contrato
 * está listo (la interfaz EmailProvider) pero la implementación se
 * deja para cuando Inyecta decida si usar SendGrid (Twilio).
 *
 * Para activarlo bastaría con:
 *   1. `npm install @sendgrid/mail`
 *   2. Reemplazar el cuerpo de send() con la llamada al SDK.
 *   3. Setear EMAIL_PROVIDER=SENDGRID y SENDGRID_API_KEY en .env.
 *
 * Mientras tanto, devolver `ok: false` con un mensaje claro evita
 * que un operador lo configure por accidente y crea que está
 * enviando emails. NO lanzamos excepción para respetar el contrato
 * fire-and-forget de la interfaz.
 */
import { childLogger } from '../../lib/logger';
import type { EmailPayload, EmailProvider, EmailSendResult } from './types';

export class SendGridEmailProvider implements EmailProvider {
  public readonly name = 'SENDGRID';
  private log = childLogger('email-sendgrid');
  private warned = false;

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    if (!this.warned) {
      // Sólo loggea una vez para no saturar producción si alguien
      // dejó SENDGRID configurado por error.
      this.log.error(
        { subject: payload.subject },
        'SendGridEmailProvider no implementado — instala @sendgrid/mail y completa la integración',
      );
      this.warned = true;
    }
    return {
      ok: false,
      provider: this.name,
      error:
        'EMAIL_PROVIDER=SENDGRID no implementado todavía. ' +
        'Usa SMTP (Gmail/Outlook/SES) o NOOP, o completa la integración en services/email/SendGridEmailProvider.ts',
    };
  }
}
