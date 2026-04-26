/**
 * GET /api/config/branding — datos públicos del emisor.
 * ----------------------------------------------------------------
 * Devuelve la razón social, contacto y datos bancarios que el cliente
 * embebe en PDFs (cotización, recibo, estado de cuenta, amortización,
 * checklist) y muestra en la página /portal del arrendatario.
 *
 * SIN AUTENTICACIÓN por diseño:
 *   • El portal del arrendatario es público (acceso por token único
 *     impreso en el contrato), así que ya muestra estos datos a
 *     cualquiera con el link.
 *   • Los PDFs se descargan desde la app pero el contenido tampoco
 *     es secreto: la CLABE, dirección y razón social están en el
 *     pie de cada cotización que se entrega al prospecto.
 *   • Mover esto detrás de auth dificultaría la generación de PDFs
 *     en el portal sin agregar valor real.
 *
 * Cambia a través de ENV vars (no se persiste en BD): cambios requieren
 * redeploy, lo cual es deseable para datos que afectan documentos
 * legales y bancarios.
 */
import { Router } from 'express';
import { config } from '../config/env';

const router = Router();

router.get('/branding', (_req, res) => {
  res.json(config.branding);
});

export default router;
