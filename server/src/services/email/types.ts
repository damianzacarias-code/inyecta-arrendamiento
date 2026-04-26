/**
 * services/email/types.ts — Contrato común para todos los proveedores de email.
 *
 * Espejo del patrón ICfdiProvider: una interfaz mínima que cualquier
 * implementación (NOOP, SMTP, SendGrid, SES…) debe satisfacer. El resto
 * del backend habla SOLO con esta interfaz; el factory en `index.ts`
 * decide cuál instancia devolver según `EMAIL_PROVIDER`.
 *
 * El email es SIEMPRE fire-and-forget desde el punto de vista del
 * llamador de negocio: el provider puede fallar (SMTP caído, API key
 * inválida, etc.) pero esa falla NO debe propagarse a la operación
 * que disparó la notificación. Cada provider es responsable de:
 *   • loggear el error con suficiente contexto.
 *   • resolver con `{ ok: false, error }` o lanzar una excepción
 *     que el llamador (lib/notificar.ts) atrape y silencie.
 *
 * No incluimos plantillas ni handlebars aquí: la plantilla la arma
 * el llamador en texto plano (y opcionalmente HTML). Mantener el
 * contrato pequeño hace que swapear proveedores sea un cambio de
 * 1 línea en el factory.
 */

/**
 * Carga útil de un email saliente.
 *
 * Campos mínimos requeridos por todos los proveedores comerciales:
 * destinatario(s), asunto y cuerpo. `from` y `replyTo` se rellenan
 * desde la configuración global si no se especifican.
 */
export interface EmailPayload {
  /** Uno o varios destinatarios. RFC 5322 — sin validación local
   *  estricta, dejamos que el provider rebote si es inválido. */
  to: string | string[];
  /** Asunto del email. Recomendado ≤ 78 chars per RFC 2822. */
  subject: string;
  /** Cuerpo en texto plano (siempre obligatorio para clientes que
   *  no soporten HTML). */
  text: string;
  /** Cuerpo HTML opcional (mismo contenido formateado). */
  html?: string;
  /** Override del `from`. Si se omite, se usa `EMAIL_FROM`. */
  from?: string;
  /** Cabecera Reply-To. Si se omite, se usa `EMAIL_REPLY_TO` o `from`. */
  replyTo?: string;
  /** CC opcional, mismo formato que `to`. */
  cc?: string | string[];
  /** BCC opcional, mismo formato que `to`. */
  bcc?: string | string[];
}

/**
 * Resultado de un envío.
 *
 * `ok=true` no garantiza entrega al buzón final — solo que el
 * provider aceptó el mensaje (handoff exitoso). La entrega real
 * depende del MTA destino, filtros antispam, reputación del
 * dominio, etc. Esto es estándar en cualquier API de email.
 */
export interface EmailSendResult {
  ok: boolean;
  /** Identificador devuelto por el provider (Message-ID en SMTP,
   *  X-Message-Id en SendGrid, MessageId en SES). Útil para
   *  tracing en los logs del proveedor. */
  messageId?: string;
  /** Mensaje de error si `ok=false`. No lanzamos excepción para
   *  que el llamador no tenga que envolver con try/catch. */
  error?: string;
  /** Nombre del provider que procesó el mensaje (NOOP/SMTP/...).
   *  Útil para auditar qué configuración corrió en cada envío. */
  provider: string;
}

/**
 * Contrato que toda implementación debe cumplir.
 *
 * Devolver SIEMPRE una promesa resuelta — los errores se reportan
 * en el campo `error` del result, NO con `throw`. Esto simplifica
 * la integración en `lib/notificar.ts`, que no debe contaminarse
 * con try/catch por cada destinatario.
 */
export interface EmailProvider {
  /** Identifica el provider (NOOP, SMTP, SENDGRID, SES). */
  readonly name: string;
  /** Envía un email. Nunca lanza: serializa el error en el result. */
  send(payload: EmailPayload): Promise<EmailSendResult>;
}
