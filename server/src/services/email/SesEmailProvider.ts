/**
 * SesEmailProvider — stub explícito para Amazon SES vía API nativa.
 *
 * Nota práctica: si Inyecta ya tiene infraestructura AWS, la opción
 * más rápida es usar el SmtpEmailProvider apuntando al endpoint SMTP
 * de SES (email-smtp.<region>.amazonaws.com:587). Esta clase queda
 * preparada para cuando se quiera usar el SDK nativo (mejores límites
 * de envío, métricas en CloudWatch, sin manejar credenciales SMTP).
 *
 * Para activarlo:
 *   1. `npm install @aws-sdk/client-sesv2`
 *   2. Setear AWS_REGION + credenciales (vía IAM role o
 *      AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY).
 *   3. Setear EMAIL_PROVIDER=SES y EMAIL_FROM con un dominio verificado.
 *   4. Reemplazar el cuerpo de send() con SendEmailCommand.
 *
 * Devuelve `ok: false` con mensaje claro mientras tanto, sin lanzar.
 */
import { childLogger } from '../../lib/logger';
import type { EmailPayload, EmailProvider, EmailSendResult } from './types';

export class SesEmailProvider implements EmailProvider {
  public readonly name = 'SES';
  private log = childLogger('email-ses');
  private warned = false;

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    if (!this.warned) {
      this.log.error(
        { subject: payload.subject },
        'SesEmailProvider no implementado — usa SMTP a email-smtp.<region>.amazonaws.com o instala @aws-sdk/client-sesv2',
      );
      this.warned = true;
    }
    return {
      ok: false,
      provider: this.name,
      error:
        'EMAIL_PROVIDER=SES no implementado todavía. ' +
        'Alternativa rápida: usa EMAIL_PROVIDER=SMTP apuntando a email-smtp.<region>.amazonaws.com:587 con credenciales SMTP de SES',
    };
  }
}
