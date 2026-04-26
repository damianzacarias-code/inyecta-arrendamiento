/**
 * SmtpEmailProvider — implementación con nodemailer + SMTP genérico.
 *
 * Sirve para CUALQUIER buzón corporativo o servidor SMTP transaccional:
 *   • Gmail / Google Workspace (smtp.gmail.com:587, STARTTLS, App Password)
 *   • Outlook 365 (smtp-mail.outlook.com:587, STARTTLS)
 *   • Amazon SES vía SMTP (email-smtp.<region>.amazonaws.com:587)
 *   • SendGrid SMTP (smtp.sendgrid.net:587, user 'apikey' + API key)
 *   • Mailgun, Postmark, Resend, Brevo, Zoho, Yandex…
 *
 * Pattern de inicialización lenta:
 *   • La instancia del transporter se crea una sola vez (la primera
 *     vez que se llama send). nodemailer se require()ea dinámicamente
 *     para que un proyecto que use NOOP (default) no pague el costo
 *     de cargar el módulo.
 *   • verifyConnection() opcional al primer envío: nodemailer ya
 *     reporta errores de auth en el sendMail; no añadimos un round
 *     trip adicional.
 *
 * Configuración:
 *   SMTP_HOST          host del servidor (ej. smtp.gmail.com)
 *   SMTP_PORT          puerto (465 = TLS implícito, 587 = STARTTLS)
 *   SMTP_USER          usuario / cuenta de envío
 *   SMTP_PASS          contraseña o token (App Password en Gmail)
 *   SMTP_SECURE        true si el puerto usa TLS implícito (465)
 *   SMTP_REQUIRE_TLS   exige STARTTLS aunque secure=false (587)
 *
 * Nodemailer es síncrono al construir, asíncrono al enviar. La
 * llamada a sendMail devuelve un objeto con `messageId` (cabecera
 * Message-ID generada). Lo propagamos en el EmailSendResult.
 */
import { childLogger } from '../../lib/logger';
import { config } from '../../config/env';
import type { EmailPayload, EmailProvider, EmailSendResult } from './types';

// nodemailer no exporta tipos default que jueguen bien con import dinámico;
// definimos un shape mínimo que cubre lo que usamos.
type NodemailerTransporter = {
  sendMail: (opts: {
    from: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    text: string;
    html?: string;
  }) => Promise<{ messageId?: string; response?: string }>;
};

type NodemailerModule = {
  createTransport: (opts: {
    host: string;
    port: number;
    secure: boolean;
    requireTLS?: boolean;
    auth?: { user: string; pass: string };
  }) => NodemailerTransporter;
};

export class SmtpEmailProvider implements EmailProvider {
  public readonly name = 'SMTP';
  private log = childLogger('email-smtp');
  private transporter: NodemailerTransporter | null = null;
  private initError: string | null = null;

  /**
   * Carga nodemailer e instancia el transporter en el primer envío.
   * Si falla (módulo no instalado, config incompleta), guardamos el
   * error y lo reportamos en cada send subsiguiente — sin volver a
   * intentar. La intención es que el operador reinicie el backend
   * tras corregir la configuración.
   */
  private async ensureTransporter(): Promise<NodemailerTransporter | null> {
    if (this.transporter) return this.transporter;
    if (this.initError) return null;

    const smtp = config.email.smtp;
    if (!smtp.host || !smtp.port) {
      this.initError = 'EMAIL_PROVIDER=SMTP requiere SMTP_HOST y SMTP_PORT';
      this.log.error(this.initError);
      return null;
    }

    try {
      // Import dinámico — nodemailer es opcional (sólo se requiere si el
      // operador eligió EMAIL_PROVIDER=SMTP). Esto evita que una imagen
      // mínima sin nodemailer falle al arrancar.
      const mod = (await import('nodemailer')) as unknown as NodemailerModule & {
        default?: NodemailerModule;
      };
      const nodemailer: NodemailerModule = mod.default ?? mod;

      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure, // true=465 (TLS implícito), false=587 (STARTTLS)
        requireTLS: smtp.requireTLS,
        auth:
          smtp.user && smtp.pass
            ? { user: smtp.user, pass: smtp.pass }
            : undefined, // permite servidores SMTP sin auth (raros pero existen)
      });

      this.log.info(
        { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user ? '***' : '(sin auth)' },
        'SMTP transporter inicializado',
      );
      return this.transporter;
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      this.log.error({ err }, 'No se pudo inicializar nodemailer/SMTP');
      return null;
    }
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    const transporter = await this.ensureTransporter();
    if (!transporter) {
      return {
        ok: false,
        provider: this.name,
        error: this.initError ?? 'transporter no inicializado',
      };
    }

    const from = payload.from ?? config.email.from;
    if (!from) {
      return {
        ok: false,
        provider: this.name,
        error: 'EMAIL_FROM no configurado y payload.from no se especificó',
      };
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        replyTo: payload.replyTo ?? config.email.replyTo ?? from,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });

      const to = Array.isArray(payload.to) ? payload.to.join(',') : payload.to;
      this.log.info(
        { to, subject: payload.subject, messageId: info.messageId },
        'email SMTP enviado',
      );
      return {
        ok: true,
        provider: this.name,
        messageId: info.messageId,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error({ err, subject: payload.subject }, 'error enviando email SMTP');
      return { ok: false, provider: this.name, error };
    }
  }
}
