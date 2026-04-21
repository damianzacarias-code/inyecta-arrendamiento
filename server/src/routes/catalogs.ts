import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { childLogger } from '../lib/logger';

const log = childLogger('catalogs');

const router = Router();

// GET /api/catalogs/asset-categories
router.get('/asset-categories', requireAuth, async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.assetCategory.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
    });
    return res.json(categories);
  } catch (error) {
    log.error({ err: error }, 'Error fetching categories');
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/catalogs/document-requirements/:clientType
router.get('/document-requirements/:clientType', requireAuth, (req: Request, res: Response) => {
  const { clientType } = req.params;

  const pfaeDocuments = [
    { tipo: 'AUTORIZACION_BURO', nombre: 'Autorización para consulta en Buró de Crédito', requerido: true },
    { tipo: 'INE', nombre: 'Identificación oficial vigente (INE o Pasaporte)', requerido: true },
    { tipo: 'ACTA_NACIMIENTO', nombre: 'Acta de Nacimiento', requerido: true },
    { tipo: 'ACTA_MATRIMONIO', nombre: 'Acta de Matrimonio o de Divorcio', requerido: false },
    { tipo: 'CSF', nombre: 'Constancia de Situación Fiscal (máx. 3 meses)', requerido: true },
    { tipo: 'COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio vigente (máx. 3 meses)', requerido: true },
    { tipo: 'OPINION_FISCAL', nombre: 'Opinión de Cumplimiento de Obligaciones Fiscales', requerido: true },
    { tipo: 'OPINION_IMSS', nombre: 'Opinión de Cumplimiento del IMSS o último pago', requerido: true },
    { tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros (cierre último ejercicio y parcial)', requerido: true },
    { tipo: 'ESTADOS_CUENTA', nombre: 'Estados de cuenta bancarios (últimos 12 meses)', requerido: true },
    { tipo: 'DECLARACION_ANUAL', nombre: 'Declaración anual de impuestos (último ejercicio)', requerido: true },
    { tipo: 'DECLARACION_PARCIAL', nombre: 'Declaración parcial de impuestos (último mes)', requerido: true },
  ];

  const pmDocuments = [
    { tipo: 'AUTORIZACION_BURO', nombre: 'Autorización para consulta en Buró de Crédito', requerido: true },
    { tipo: 'CSF', nombre: 'Constancia de Situación Fiscal (máx. 3 meses)', requerido: true },
    { tipo: 'COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio vigente (máx. 3 meses)', requerido: true },
    { tipo: 'OPINION_FISCAL', nombre: 'Opinión de Cumplimiento de Obligaciones Fiscales', requerido: true },
    { tipo: 'OPINION_IMSS', nombre: 'Opinión de Cumplimiento del IMSS o último pago', requerido: true },
    { tipo: 'ACTA_CONSTITUTIVA', nombre: 'Acta Constitutiva con boleta Reg. Público del Comercio', requerido: true },
    { tipo: 'ACTAS_ASAMBLEA', nombre: 'Actas de Asamblea y Poderes con inscripción', requerido: true },
    { tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros (cierre último ejercicio y parcial)', requerido: true },
    { tipo: 'ESTADOS_CUENTA', nombre: 'Estados de cuenta bancarios (últimos 12 meses)', requerido: true },
    { tipo: 'DECLARACION_ANUAL', nombre: 'Declaración anual de impuestos (último ejercicio)', requerido: true },
    { tipo: 'DECLARACION_PARCIAL', nombre: 'Declaración parcial de impuestos (último mes)', requerido: true },
    // Rep. Legal y socios (51%+)
    { tipo: 'RL_INE', nombre: 'Rep. Legal / Socios - INE o Pasaporte', requerido: true },
    { tipo: 'RL_ACTA_NACIMIENTO', nombre: 'Rep. Legal / Socios - Acta de Nacimiento', requerido: true },
    { tipo: 'RL_ACTA_MATRIMONIO', nombre: 'Rep. Legal / Socios - Acta de Matrimonio/Divorcio', requerido: false },
    { tipo: 'RL_CSF', nombre: 'Rep. Legal / Socios - Constancia de Situación Fiscal', requerido: true },
    { tipo: 'RL_COMPROBANTE_DOMICILIO', nombre: 'Rep. Legal / Socios - Comprobante de domicilio', requerido: true },
  ];

  const avalDocuments = [
    { tipo: 'AVAL_AUTORIZACION_BURO', nombre: 'Autorización para consulta en Buró de Crédito', requerido: true },
    { tipo: 'AVAL_INE', nombre: 'Identificación oficial vigente (INE o Pasaporte)', requerido: true },
    { tipo: 'AVAL_ACTA_NACIMIENTO', nombre: 'Acta de Nacimiento', requerido: true },
    { tipo: 'AVAL_ACTA_MATRIMONIO', nombre: 'Acta de Matrimonio o de Divorcio', requerido: false },
    { tipo: 'AVAL_CSF', nombre: 'Constancia de Situación Fiscal (máx. 3 meses)', requerido: true },
    { tipo: 'AVAL_COMPROBANTE_DOMICILIO', nombre: 'Comprobante de domicilio vigente (máx. 3 meses)', requerido: true },
    { tipo: 'AVAL_NOMINA', nombre: 'Recibos de nómina (últimos 6 meses)', requerido: true },
    { tipo: 'AVAL_ESTADOS_CUENTA', nombre: 'Estados de cuenta bancarios (últimos 6 meses)', requerido: true },
  ];

  if (clientType === 'PFAE') {
    return res.json({ cliente: pfaeDocuments, aval: avalDocuments });
  } else if (clientType === 'PM') {
    return res.json({ cliente: pmDocuments, aval: avalDocuments });
  } else {
    return res.status(400).json({ error: 'Tipo de cliente inválido. Use PFAE o PM' });
  }
});

// GET /api/catalogs/risk-levels
router.get('/risk-levels', requireAuth, (_req: Request, res: Response) => {
  return res.json([
    {
      nivel: 'A', nombre: 'Menor Riesgo',
      puro: { depositoGarantia: 0.16, enganche: 0, total: 0.16 },
      financiero: { depositoGarantia: 0.16, enganche: 0, total: 0.16 },
    },
    {
      nivel: 'B', nombre: 'Riesgo Medio',
      puro: { depositoGarantia: 0.21, enganche: 0, total: 0.21 },
      financiero: { depositoGarantia: 0.16, enganche: 0.05, total: 0.21 },
    },
    {
      nivel: 'C', nombre: 'Mayor Riesgo',
      puro: { depositoGarantia: 0.26, enganche: 0, total: 0.26 },
      financiero: { depositoGarantia: 0.16, enganche: 0.10, total: 0.26 },
    },
  ]);
});

// GET /api/catalogs/lease-params
router.get('/lease-params', requireAuth, (_req: Request, res: Response) => {
  return res.json({
    montoMinimo: 150000,
    montoMaximo: 3000000,
    plazoMinimo: 12,
    plazoMaximo: 48,
    tasaBase: 0.36,
    comisionApertura: 0.05,
    ivaRate: 0.16,
    opcionCompraFinanciero: 0.02,
  });
});

export default router;
