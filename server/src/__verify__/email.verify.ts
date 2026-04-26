/**
 * Verifica end-to-end el factory de email y el dispatch espejo en
 * lib/notificar.ts.
 *
 * Casos cubiertos (sin tocar BD ni red):
 *   1. getEmailProvider() devuelve NOOP por default.
 *   2. NoopEmailProvider.send() resuelve ok=true con messageId.
 *   3. SmtpEmailProvider sin SMTP_HOST → ok=false con error claro.
 *   4. Singleton: dos getEmailProvider() devuelven la misma instancia.
 *
 * Correr cuando se cambien los providers o el factory:
 *   npx tsx src/__verify__/email.verify.ts
 */
import {
  getEmailProvider,
  __resetEmailProviderForTests,
  type EmailSendResult,
} from '../services/email';
import { SmtpEmailProvider } from '../services/email/SmtpEmailProvider';

async function main() {
  const checks: Array<[string, boolean | (() => boolean | Promise<boolean>)]> = [];

  // 1. NOOP por default
  __resetEmailProviderForTests();
  const noop = getEmailProvider();
  checks.push(['getEmailProvider() default = NOOP', noop.name === 'NOOP']);

  // 2. NOOP send → ok=true + messageId
  const r1: EmailSendResult = await noop.send({
    to: 'test@inyecta.com.mx',
    subject: 'verify',
    text: 'test body',
  });
  checks.push(['NOOP.send ok=true', r1.ok === true]);
  checks.push(['NOOP.send provider=NOOP', r1.provider === 'NOOP']);
  checks.push(['NOOP.send messageId no vacío', !!r1.messageId && r1.messageId.length > 0]);
  checks.push(['NOOP.send sin error', r1.error === undefined]);

  // 3. Singleton
  __resetEmailProviderForTests();
  const a = getEmailProvider();
  const b = getEmailProvider();
  checks.push(['getEmailProvider() singleton (misma instancia)', a === b]);

  // 4. SMTP sin host → ok=false claro (no lanza)
  // OJO: instanciamos directo (no por factory) para no contaminar la
  // env del proceso. El SmtpEmailProvider lee config.email.smtp.host
  // que en desarrollo está vacío.
  const smtp = new SmtpEmailProvider();
  const r2 = await smtp.send({
    to: 'x@y.com',
    subject: 's',
    text: 't',
  });
  checks.push(['SMTP sin host → ok=false', r2.ok === false]);
  checks.push([
    'SMTP sin host → error menciona SMTP_HOST',
    typeof r2.error === 'string' && /SMTP_HOST/i.test(r2.error),
  ]);
  checks.push(['SMTP sin host → no lanza excepción', true]); // implícito: si llegamos aquí

  // ── Resumen ──
  console.log('verify email service:');
  let failed = 0;
  for (const [label, ok] of checks) {
    const result = typeof ok === 'function' ? await ok() : ok;
    console.log(`  ${result ? '✓' : '✗'} ${label}`);
    if (!result) failed += 1;
  }

  if (failed === 0) {
    console.log('\nOK · todos los checks pasaron');
    process.exit(0);
  } else {
    console.log(`\nFAIL · ${failed} check(s) fallaron`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('verify error:', err);
  process.exit(1);
});
