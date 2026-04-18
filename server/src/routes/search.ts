/**
 * Búsqueda Global
 *
 *   GET /api/search?q=texto[&types=clients,contracts,quotations,invoices][&limit=10]
 *
 * Devuelve resultados unificados de:
 *  - Clientes (nombre/razón social/RFC/email/teléfono)
 *  - Contratos (folio/bien)
 *  - Cotizaciones (folio/cliente)
 *  - Facturas (UUID/serie-folio/RFC receptor)
 *
 * Cada resultado tiene: { kind, id, title, subtitle, url, icon }.
 * Pensado para alimentar la paleta de comandos Cmd+K del cliente.
 */
import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

interface SearchResult {
  kind: 'cliente' | 'contrato' | 'cotizacion' | 'factura';
  id: string;
  title: string;
  subtitle: string;
  url: string;
  badge?: string;
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [], q });

    const types = String(req.query.types || 'clients,contracts,quotations,invoices').split(',');
    const limit = Math.min(parseInt(String(req.query.limit || '10')), 25);

    const results: SearchResult[] = [];
    const qLower = q.toLowerCase();

    // ─── Clientes ───
    if (types.includes('clients')) {
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { nombre:          { contains: q, mode: 'insensitive' } },
            { apellidoPaterno: { contains: q, mode: 'insensitive' } },
            { apellidoMaterno: { contains: q, mode: 'insensitive' } },
            { razonSocial:     { contains: q, mode: 'insensitive' } },
            { rfc:             { contains: q, mode: 'insensitive' } },
            { email:           { contains: q, mode: 'insensitive' } },
            { telefono:        { contains: q, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, tipo: true, nombre: true, apellidoPaterno: true,
          razonSocial: true, rfc: true, email: true,
        },
      });
      clients.forEach(c => {
        const nombre = c.tipo === 'PM'
          ? c.razonSocial || ''
          : `${c.nombre || ''} ${c.apellidoPaterno || ''}`.trim();
        results.push({
          kind: 'cliente',
          id: c.id,
          title: nombre || '(sin nombre)',
          subtitle: `${c.rfc || 'sin RFC'} · ${c.email || 'sin email'}`,
          url: `/clientes/${c.id}`,
          badge: c.tipo,
        });
      });
    }

    // ─── Contratos ───
    if (types.includes('contracts')) {
      const contracts = await prisma.contract.findMany({
        where: {
          OR: [
            { folio:           { contains: q, mode: 'insensitive' } },
            { bienDescripcion: { contains: q, mode: 'insensitive' } },
            { bienMarca:       { contains: q, mode: 'insensitive' } },
            { bienModelo:      { contains: q, mode: 'insensitive' } },
            { bienNumSerie:    { contains: q, mode: 'insensitive' } },
            { client: { is: { rfc:         { contains: q, mode: 'insensitive' } } } },
            { client: { is: { razonSocial: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, folio: true, producto: true, estatus: true,
          bienDescripcion: true,
          client: {
            select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true },
          },
        },
      });
      contracts.forEach(c => {
        const nombre = c.client.tipo === 'PM'
          ? c.client.razonSocial || ''
          : `${c.client.nombre || ''} ${c.client.apellidoPaterno || ''}`.trim();
        results.push({
          kind: 'contrato',
          id: c.id,
          title: `${c.folio} — ${c.bienDescripcion?.slice(0, 50) || ''}`,
          subtitle: `${nombre} · ${c.producto}`,
          url: `/contratos/${c.id}`,
          badge: c.estatus,
        });
      });
    }

    // ─── Cotizaciones ───
    if (types.includes('quotations')) {
      const quotations = await prisma.quotation.findMany({
        where: {
          OR: [
            { folio:         { contains: q, mode: 'insensitive' } },
            { nombreCliente: { contains: q, mode: 'insensitive' } },
            { client: { is: { rfc:         { contains: q, mode: 'insensitive' } } } },
            { client: { is: { nombre:      { contains: q, mode: 'insensitive' } } } },
            { client: { is: { razonSocial: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, folio: true, producto: true, estado: true, nombreCliente: true,
          client: {
            select: { tipo: true, nombre: true, apellidoPaterno: true, razonSocial: true },
          },
        },
      });
      quotations.forEach(q2 => {
        const nombre = q2.client
          ? (q2.client.tipo === 'PM'
              ? q2.client.razonSocial || ''
              : `${q2.client.nombre || ''} ${q2.client.apellidoPaterno || ''}`.trim())
          : q2.nombreCliente;
        results.push({
          kind: 'cotizacion',
          id: q2.id,
          title: q2.folio,
          subtitle: `${nombre} · ${q2.producto}`,
          url: `/cotizaciones/${q2.id}`,
          badge: q2.estado,
        });
      });
    }

    // ─── Facturas ───
    if (types.includes('invoices')) {
      const invoices = await prisma.invoice.findMany({
        where: {
          OR: [
            { uuid:           { contains: q, mode: 'insensitive' } },
            { rfcReceptor:    { contains: q, mode: 'insensitive' } },
            { nombreReceptor: { contains: q, mode: 'insensitive' } },
            ...(q.match(/^[A-Z]?-?\d+$/i) ? [{ folio: parseInt(q.replace(/[^\d]/g, '')) || 0 }] : []),
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, serie: true, folio: true, uuid: true, status: true,
          nombreReceptor: true, total: true,
        },
      });
      invoices.forEach(inv => {
        results.push({
          kind: 'factura',
          id: inv.id,
          title: `${inv.serie}-${inv.folio}`,
          subtitle: `${inv.nombreReceptor} · $${Number(inv.total).toLocaleString('es-MX')}`,
          url: `/facturas`, // TODO: link a detalle si existe
          badge: inv.status,
        });
      });
    }

    res.json({ q, results, total: results.length });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message || 'Error en búsqueda' });
  }
});

export default router;
