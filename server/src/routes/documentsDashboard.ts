/**
 * /api/documents/dashboard — Vista agregada de documentación cross-contratos.
 *
 * Antes existía un módulo /api/documents con CRUD por cliente (modelo
 * legacy ClientDocument). La migración 20260422_expediente_por_actor
 * movió todo a por-contrato (ExpedienteActor + ExpedienteDocumento) y
 * eliminó el módulo viejo, pero dejó la página /documentos huérfana.
 *
 * Esta ruta NUEVA reemplaza esa página: agrega los documentos de TODOS
 * los contratos de cada cliente y produce un dashboard de cumplimiento
 * documental (qué % validado, qué pendiente, qué rechazado). Es de sólo
 * lectura — la edición de un documento sigue estando en
 * /api/expediente/* via /contratos/:id → tab Documentos.
 *
 * Uso: GET /api/documents/dashboard?filtro=todos|con_alertas|incompletos|completos&search=texto
 *
 * Damián 30-04-2026 — opción 2 del plan R5.
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { childLogger } from '../lib/logger';

const router = Router();
const log = childLogger('documents-dashboard');

const querySchema = z.object({
  filtro: z.enum(['todos', 'con_alertas', 'incompletos', 'completos']).default('todos'),
  search: z.string().trim().max(120).optional(),
});

/**
 * Calcula la métrica resumida de un cliente a partir de sus documentos.
 * Lógica de filtros coincidente con la UI:
 *   • completo:      todos VALIDADO (y al menos 1 doc)
 *   • con_alertas:   tiene al menos 1 RECHAZADO o no tiene contratos
 *   • incompletos:   tiene al menos 1 PENDIENTE o RECHAZADO (no totalmente validado)
 *   • todos:         sin filtro
 */
function metricasCliente(docs: { estatus: string }[], totalContratos: number) {
  const validados   = docs.filter((d) => d.estatus === 'VALIDADO').length;
  const pendientes  = docs.filter((d) => d.estatus === 'PENDIENTE').length;
  const rechazados  = docs.filter((d) => d.estatus === 'RECHAZADO').length;
  const total       = docs.length;
  const porcentajeValidado = total > 0 ? Math.round((validados / total) * 100) : 0;

  // Alerta: rechazado prevalece sobre pendiente; sin contratos = aviso bajo.
  let alerta: 'rechazado' | 'pendiente' | 'sin_contratos' | null = null;
  if (rechazados > 0) alerta = 'rechazado';
  else if (pendientes > 0) alerta = 'pendiente';
  else if (totalContratos === 0) alerta = 'sin_contratos';

  const completo = total > 0 && pendientes === 0 && rechazados === 0;

  return { validados, pendientes, rechazados, total, porcentajeValidado, alerta, completo };
}

router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { filtro, search } = querySchema.parse(req.query);

    // Trae TODOS los clientes activos con sus contratos y documentos
    // anidados. Es una sola query con joins para no caer en N+1.
    // Para un volumen grande (>500 clientes) habría que paginar y
    // mover el filtrado al SQL — hoy es manejable en memoria.
    const clientes = await prisma.client.findMany({
      where: {
        activo: true,
        ...(search ? {
          OR: [
            { nombre:          { contains: search, mode: 'insensitive' } },
            { apellidoPaterno: { contains: search, mode: 'insensitive' } },
            { razonSocial:     { contains: search, mode: 'insensitive' } },
            { rfc:             { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true, tipo: true,
        nombre: true, apellidoPaterno: true, apellidoMaterno: true,
        razonSocial: true, rfc: true, email: true,
        contratos: {
          select: {
            id: true, folio: true, etapa: true, estatus: true, producto: true,
            actores: {
              select: {
                id: true,
                documentos: { select: { estatus: true } },
              },
            },
          },
        },
      },
      orderBy: [{ tipo: 'asc' }, { razonSocial: 'asc' }, { apellidoPaterno: 'asc' }],
    });

    // Agregación + filtrado en memoria (estructura denormalizada por
    // cliente → docs aplanados de todos sus contratos).
    type ClienteAgregado = {
      id: string;
      tipo: 'PFAE' | 'PM';
      nombre: string;
      rfc: string | null;
      email: string | null;
      totalContratos: number;
      contratos: { id: string; folio: string; etapa: string; estatus: string; producto: string; docCount: number }[];
      documentos: ReturnType<typeof metricasCliente>;
    };

    const agregados: ClienteAgregado[] = clientes.map((c) => {
      const todosDocs = c.contratos.flatMap((k) => k.actores.flatMap((a) => a.documentos));
      const metricas = metricasCliente(todosDocs, c.contratos.length);
      const nombre = c.tipo === 'PM'
        ? (c.razonSocial || 'Sin razón social')
        : [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ').trim() || 'Sin nombre';
      return {
        id: c.id,
        tipo: c.tipo,
        nombre,
        rfc: c.rfc,
        email: c.email,
        totalContratos: c.contratos.length,
        contratos: c.contratos.map((k) => ({
          id: k.id, folio: k.folio, etapa: k.etapa, estatus: k.estatus, producto: k.producto,
          docCount: k.actores.reduce((acc, a) => acc + a.documentos.length, 0),
        })),
        documentos: metricas,
      };
    });

    // Totales globales (siempre se calculan sobre el set sin filtrar
    // para que los counters de los tabs no salten al cambiar filtro).
    const totales = {
      todos:       agregados.length,
      conAlertas:  agregados.filter((a) => a.documentos.alerta === 'rechazado' || a.documentos.alerta === 'pendiente').length,
      incompletos: agregados.filter((a) => !a.documentos.completo).length,
      completos:   agregados.filter((a) => a.documentos.completo).length,
    };

    // Filtro final
    const filtrados = agregados.filter((a) => {
      if (filtro === 'con_alertas')  return a.documentos.alerta === 'rechazado' || a.documentos.alerta === 'pendiente';
      if (filtro === 'incompletos')  return !a.documentos.completo;
      if (filtro === 'completos')    return a.documentos.completo;
      return true;
    });

    log.debug({ count: agregados.length, filtro }, 'documents dashboard');
    res.json({ clientes: filtrados, totales });
  }),
);

export default router;
