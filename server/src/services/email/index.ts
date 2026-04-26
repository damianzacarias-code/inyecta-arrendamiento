/**
 * services/email/index.ts — Factory + singleton del proveedor de email.
 *
 * Espejo del patrón en services/cfdiProvider.ts. Una sola instancia por
 * proceso, decidida al primer acceso según `EMAIL_PROVIDER`. El resto
 * del código usa SIEMPRE `getEmailProvider()` y nunca instancia manual.
 *
 * Cambiar de provider en producción es:
 *   1. editar la variable EMAIL_PROVIDER en .env
 *   2. reiniciar el backend
 *
 * Sin recompilar ni redeployar el cliente — el email es 100%
 * server-side.
 */
import { config } from '../../config/env';
import { childLogger } from '../../lib/logger';
import { NoopEmailProvider } from './NoopEmailProvider';
import { SmtpEmailProvider } from './SmtpEmailProvider';
import { SendGridEmailProvider } from './SendGridEmailProvider';
import { SesEmailProvider } from './SesEmailProvider';
import type { EmailProvider } from './types';

export type { EmailPayload, EmailProvider, EmailSendResult } from './types';

const log = childLogger('email-factory');
let instance: EmailProvider | null = null;

/**
 * Devuelve el provider activo. Lazy: la instancia se crea la primera
 * vez que se llama, no en el require del módulo, para no incurrir en
 * el costo de cargar nodemailer si nadie envía emails.
 *
 * Provider invocado según `config.email.provider`:
 *   NOOP     → NoopEmailProvider (default)
 *   SMTP     → SmtpEmailProvider (nodemailer)
 *   SENDGRID → SendGridEmailProvider (stub)
 *   SES      → SesEmailProvider (stub)
 */
export function getEmailProvider(): EmailProvider {
  if (instance) return instance;

  const provider = config.email.provider;
  switch (provider) {
    case 'SMTP':
      instance = new SmtpEmailProvider();
      break;
    case 'SENDGRID':
      instance = new SendGridEmailProvider();
      break;
    case 'SES':
      instance = new SesEmailProvider();
      break;
    case 'NOOP':
    default:
      instance = new NoopEmailProvider();
      break;
  }

  log.info({ provider: instance.name }, `EmailProvider activo: ${instance.name}`);
  return instance;
}

/**
 * Reset interno para tests. Permite cambiar de provider entre tests
 * sin reiniciar el proceso. NO usar en código de producción.
 */
export function __resetEmailProviderForTests(): void {
  instance = null;
}
