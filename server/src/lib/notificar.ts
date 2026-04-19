/**
 * Sistema de notificaciones in-app — Inyecta Arrendamiento
 * ---------------------------------------------------------------
 * CLAUDE.md §9 T9. Reglas de enrutamiento:
 *
 *   • Siempre se notifica a TODOS los usuarios con rol ADMIN activos.
 *   • Si se proporciona `ejecutivoId` (analista/ejecutivo dueño de la
 *     operación), también recibe la notificación.
 *   • Si el `tipo` empieza con "SOLICITUD_", se notifica además a todos
 *     los usuarios con rol LEGAL activos.
 *   • Usuarios desactivados (activo=false) nunca reciben notificaciones.
 *   • Se de-duplica por userId para evitar entradas repetidas cuando
 *     el ejecutivo coincide con un ADMIN/LEGAL.
 *
 * Diseño:
 *   - Las funciones son fire-and-forget: si fallan, sólo loggean. Una
 *     notificación nunca debe tumbar una operación de negocio.
 *   - Toda inserción usa `createMany` con un solo round-trip a la BD.
 *   - El llamador no necesita conocer el rol del destinatario, sólo el
 *     tipo de evento.
 */
import prisma from '../config/db';

// ───────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────

export interface NotificacionPayload {
  /** Identificador del evento. Convención: VERBO_RECURSO en MAYÚSCULAS.
   *  Si empieza con `SOLICITUD_`, también se notifica a LEGAL. */
  tipo: string;
  /** Texto corto para listado en la campana (≤80 chars sugerido). */
  titulo: string;
  /** Descripción legible del evento. */
  mensaje: string;
  /** Modelo Prisma relacionado (ej: "Contract", "Quotation"). */
  entidad?: string;
  /** Id del recurso relacionado. */
  entidadId?: string;
  /** Deep-link al detalle (path frontend). */
  url?: string;
  /** Id del ejecutivo dueño de la operación. Recibe siempre. */
  ejecutivoId?: string;
}

// ───────────────────────────────────────────────────────────────────
// Helpers privados
// ───────────────────────────────────────────────────────────────────

const PREFIJO_LEGAL = 'SOLICITUD_';

async function obtenerDestinatarios(
  payload: NotificacionPayload,
): Promise<Set<string>> {
  const ids = new Set<string>();

  // 1. Siempre: todos los ADMIN activos
  // 2. Si tipo empieza con SOLICITUD_: también todos los LEGAL activos
  const roles: ('ADMIN' | 'LEGAL')[] = ['ADMIN'];
  if (payload.tipo.startsWith(PREFIJO_LEGAL)) {
    roles.push('LEGAL');
  }

  const usuariosRol = await prisma.user.findMany({
    where: { rol: { in: roles }, activo: true },
    select: { id: true },
  });
  for (const u of usuariosRol) ids.add(u.id);

  // 3. Ejecutivo de la operación (si se especificó y está activo)
  if (payload.ejecutivoId) {
    const ejecutivo = await prisma.user.findUnique({
      where: { id: payload.ejecutivoId },
      select: { id: true, activo: true },
    });
    if (ejecutivo?.activo) ids.add(ejecutivo.id);
  }

  return ids;
}

// ───────────────────────────────────────────────────────────────────
// API pública
// ───────────────────────────────────────────────────────────────────

/**
 * Encola una notificación para los destinatarios derivados del payload.
 * No bloquea el flujo de la petición: cualquier error se loggea.
 *
 * Ejemplo:
 *   await notificar({
 *     tipo: 'SOLICITUD_CREADA',
 *     titulo: 'Nueva solicitud ARR-001-2026',
 *     mensaje: 'Toyota Hilux por $850,000 — cliente Juan Pérez',
 *     entidad: 'Contract',
 *     entidadId: contrato.id,
 *     url: `/operaciones/mesa/${contrato.id}`,
 *     ejecutivoId: contrato.userId,
 *   });
 */
export async function notificar(payload: NotificacionPayload): Promise<void> {
  try {
    const destinatarios = await obtenerDestinatarios(payload);
    if (destinatarios.size === 0) return;

    await prisma.notificacion.createMany({
      data: Array.from(destinatarios).map((userId) => ({
        userId,
        tipo:      payload.tipo,
        titulo:    payload.titulo,
        mensaje:   payload.mensaje,
        entidad:   payload.entidad   ?? null,
        entidadId: payload.entidadId ?? null,
        url:       payload.url       ?? null,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error('[notificar] error encolando notificación', err);
  }
}

/**
 * Notifica a todos los usuarios con uno de los roles indicados (sin
 * importar la convención SOLICITUD_*). Útil para alertas operativas
 * dirigidas (ej: COBRANZA cuando hay mora ≥ 30 días).
 */
export async function notificarPorRol(
  roles: string[],
  payload: Omit<NotificacionPayload, 'ejecutivoId'>,
): Promise<void> {
  try {
    if (roles.length === 0) return;
    const usuarios = await prisma.user.findMany({
      where: {
        rol:   { in: roles as Array<'ADMIN' | 'DIRECTOR' | 'ANALISTA' | 'COBRANZA' | 'OPERACIONES' | 'LEGAL'> },
        activo: true,
      },
      select: { id: true },
    });
    if (usuarios.length === 0) return;

    await prisma.notificacion.createMany({
      data: usuarios.map((u) => ({
        userId:    u.id,
        tipo:      payload.tipo,
        titulo:    payload.titulo,
        mensaje:   payload.mensaje,
        entidad:   payload.entidad   ?? null,
        entidadId: payload.entidadId ?? null,
        url:       payload.url       ?? null,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error('[notificarPorRol] error encolando notificación', err);
  }
}

/**
 * Notifica a un único usuario. Útil para confirmaciones individuales
 * (ej: "Tu cotización fue aprobada"). No aplica reglas de rol.
 */
export async function notificarUsuario(
  userId: string,
  payload: Omit<NotificacionPayload, 'ejecutivoId'>,
): Promise<void> {
  try {
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, activo: true },
    });
    if (!usuario?.activo) return;

    await prisma.notificacion.create({
      data: {
        userId,
        tipo:      payload.tipo,
        titulo:    payload.titulo,
        mensaje:   payload.mensaje,
        entidad:   payload.entidad   ?? null,
        entidadId: payload.entidadId ?? null,
        url:       payload.url       ?? null,
      },
    });
  } catch (err) {
    console.error('[notificarUsuario] error encolando notificación', err);
  }
}
