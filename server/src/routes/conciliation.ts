/**
 * Conciliación Bancaria
 *
 *   POST  /api/conciliation/upload                  — Sube CSV de estado de cuenta
 *   GET   /api/conciliation/statements              — Lista estados de cuenta
 *   GET   /api/conciliation/statements/:id          — Detalle con transacciones
 *   POST  /api/conciliation/auto-match/:statementId — Sugiere matches automáticos
 *   POST  /api/conciliation/match                   — Confirma vínculo tx → payment
 *   POST  /api/conciliation/unmatch                 — Deshace vínculo
 *   DELETE /api/conciliation/statements/:id         — Borra estado de cuenta
 *
 * El auto-match propone vínculos con un score 0-100 basado en:
 *  - Coincidencia de monto exacto (40 pts)
 *  - Folio del contrato en la descripción/referencia (35 pts)
 *  - Fecha del depósito ≤ 5 días después del vencimiento (15 pts)
 *  - Sin pago previo de ese periodo (10 pts)
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../config/db';
import { requireAuth } from '../middleware/auth';
import { parseCSV, ParsedTransaction } from '../services/csvParser';
import { childLogger } from '../lib/logger';

const log = childLogger('conciliation');

const router = Router();

// ─── Storage para CSVs subidos ───
const ROOT = path.resolve(__dirname, '..', '..', 'uploads', 'estados-cuenta');
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ROOT),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const stamp = Date.now();
      const rand = crypto.randomBytes(3).toString('hex');
      cb(null, `${stamp}_${rand}_estado${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.csv', '.txt'].includes(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(new Error('Solo se aceptan archivos CSV/TXT'));
  },
}).single('archivo');

// ─── POST /api/conciliation/upload ──────────────────────────
router.post('/upload', requireAuth, (req: Request, res: Response) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Falta archivo CSV' });

    try {
      const userId = req.user!.userId;
      const content = fs.readFileSync(req.file.path, 'utf-8');
      const parsed = parseCSV(content);

      if (parsed.transactions.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: 'No se pudieron leer transacciones',
          detalle: parsed.errors,
        });
      }

      const fechas = parsed.transactions.map(t => t.fecha.getTime());
      const totalAbonos = parsed.transactions
        .filter(t => t.tipo === 'ABONO').reduce((s, t) => s + t.monto, 0);
      const totalCargos = parsed.transactions
        .filter(t => t.tipo === 'CARGO').reduce((s, t) => s + Math.abs(t.monto), 0);

      const statement = await prisma.bankStatement.create({
        data: {
          banco: parsed.banco,
          fileName: req.file.originalname,
          fechaInicio: new Date(Math.min(...fechas)),
          fechaFin: new Date(Math.max(...fechas)),
          totalAbonos,
          totalCargos,
          uploadedBy: userId,
          transacciones: {
            create: parsed.transactions.map(t => ({
              fecha: t.fecha,
              descripcion: t.descripcion,
              referencia: t.referencia,
              monto: t.monto,
              tipo: t.tipo,
            })),
          },
        },
        include: { transacciones: true },
      });

      res.json({
        ok: true,
        statement: {
          id: statement.id,
          banco: statement.banco,
          totalRows: statement.transacciones.length,
          totalAbonos: Number(statement.totalAbonos),
          totalCargos: Number(statement.totalCargos),
          fechaInicio: statement.fechaInicio,
          fechaFin: statement.fechaFin,
        },
        warnings: parsed.errors,
      });
    } catch (error: any) {
      log.error({ err: error }, 'Conciliation upload error');
      res.status(500).json({ error: error.message || 'Error al procesar el archivo' });
    }
  });
});

// ─── GET /api/conciliation/statements ───────────────────────
router.get('/statements', requireAuth, async (_req: Request, res: Response) => {
  try {
    const statements = await prisma.bankStatement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { transacciones: true } } },
    });
    res.json({
      statements: statements.map(s => ({
        ...s,
        totalAbonos: Number(s.totalAbonos),
        totalCargos: Number(s.totalCargos),
        transacciones: s._count.transacciones,
      })),
    });
  } catch (error) {
    log.error({ err: error }, 'Statements error');
    res.status(500).json({ error: 'Error al listar estados de cuenta' });
  }
});

// ─── GET /api/conciliation/statements/:id ───────────────────
router.get('/statements/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const statement = await prisma.bankStatement.findUnique({
      where: { id: req.params.id },
      include: { transacciones: { orderBy: { fecha: 'asc' } } },
    });
    if (!statement) return res.status(404).json({ error: 'Estado de cuenta no encontrado' });

    res.json({
      ...statement,
      totalAbonos: Number(statement.totalAbonos),
      totalCargos: Number(statement.totalCargos),
      transacciones: statement.transacciones.map(t => ({
        ...t,
        monto: Number(t.monto),
      })),
    });
  } catch (error) {
    log.error({ err: error }, 'Statement detail error');
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
});

// ─── POST /api/conciliation/auto-match/:statementId ─────────
// Sugiere matches sin persistirlos (devuelve sugerencias para revisar).
router.post('/auto-match/:statementId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { statementId } = req.params;
    const stmt = await prisma.bankStatement.findUnique({
      where: { id: statementId },
      include: { transacciones: true },
    });
    if (!stmt) return res.status(404).json({ error: 'Estado de cuenta no encontrado' });

    // Solo abonos (ingresos para Inyecta)
    const abonos = stmt.transacciones.filter(t => t.tipo === 'ABONO' && !t.matched);
    if (abonos.length === 0) {
      return res.json({ suggestions: [], message: 'No hay abonos pendientes de conciliar' });
    }

    // Cargar contratos VIGENTES con sus periodos pendientes y un poco de contexto
    const contracts = await prisma.contract.findMany({
      where: { estatus: { in: ['VIGENTE', 'VENCIDO'] } },
      include: {
        amortizacion: { orderBy: { periodo: 'asc' } },
        pagos: true,
        client: { select: { nombre: true, apellidoPaterno: true, razonSocial: true, rfc: true } },
      },
    });

    // Para cada abono, calcular candidato
    const suggestions: Array<{
      transactionId: string;
      fecha: Date;
      monto: number;
      descripcion: string;
      bestMatch: {
        contractId: string;
        contractFolio: string;
        clienteNombre: string;
        periodo: number | null;
        montoEsperado: number;
        diasDiferencia: number;
        score: number;
        razones: string[];
      } | null;
    }> = [];

    for (const tx of abonos) {
      const txMonto = Number(tx.monto);
      const desc = (tx.descripcion + ' ' + (tx.referencia || '')).toUpperCase();

      let bestScore = 0;
      let best: any = null;

      for (const c of contracts) {
        const reasons: string[] = [];
        let score = 0;

        // Folio en descripción
        if (c.folio && desc.includes(c.folio.toUpperCase())) {
          score += 35;
          reasons.push(`folio ${c.folio} en descripción`);
        }

        // RFC en descripción
        if (c.client.rfc && desc.includes(c.client.rfc.toUpperCase())) {
          score += 20;
          reasons.push(`RFC del cliente`);
        }

        // Buscar periodo pendiente con monto coincidente
        const pagosByPeriodo = new Map<number, typeof c.pagos>();
        c.pagos.forEach(p => {
          if (p.periodo === null) return;
          if (!pagosByPeriodo.has(p.periodo)) pagosByPeriodo.set(p.periodo, []);
          pagosByPeriodo.get(p.periodo)!.push(p);
        });

        let mejorPeriodo: number | null = null;
        let montoEsperado = 0;
        let diasDif = 999;

        for (const entry of c.amortizacion) {
          const pagosPrevios = pagosByPeriodo.get(entry.periodo) || [];
          const pagadoTotal = pagosPrevios.reduce((s, p) => s + Number(p.montoTotal), 0);
          const total = Number(entry.pagoTotal);
          const pendiente = total - pagadoTotal;
          if (pendiente <= 0.01) continue;

          // Match exacto al pendiente, o a la renta+IVA original
          const diff = Math.abs(txMonto - pendiente);
          const diffOriginal = Math.abs(txMonto - total);
          const minDiff = Math.min(diff, diffOriginal);

          if (minDiff < 1) {
            // Score por monto exacto
            const dias = Math.abs(
              (tx.fecha.getTime() - entry.fechaPago.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (dias < diasDif) {
              mejorPeriodo = entry.periodo;
              montoEsperado = pendiente;
              diasDif = dias;
            }
          }
        }

        if (mejorPeriodo !== null) {
          score += 40;
          reasons.push(`monto coincide con periodo ${mejorPeriodo}`);
          if (diasDif <= 5) {
            score += 15;
            reasons.push(`fecha próxima al vencimiento (±${Math.round(diasDif)}d)`);
          }
          score += 10;
          reasons.push('sin pago previo de ese periodo');
        }

        if (score > bestScore) {
          bestScore = score;
          best = {
            contractId: c.id,
            contractFolio: c.folio,
            clienteNombre: c.client.razonSocial || `${c.client.nombre || ''} ${c.client.apellidoPaterno || ''}`.trim(),
            periodo: mejorPeriodo,
            montoEsperado,
            diasDiferencia: Math.round(diasDif),
            score,
            razones: reasons,
          };
        }
      }

      suggestions.push({
        transactionId: tx.id,
        fecha: tx.fecha,
        monto: txMonto,
        descripcion: tx.descripcion,
        bestMatch: best && best.score >= 40 ? best : null,
      });
    }

    res.json({
      total: abonos.length,
      conSugerencia: suggestions.filter(s => s.bestMatch).length,
      suggestions,
    });
  } catch (error: any) {
    log.error({ err: error }, 'Auto-match error');
    res.status(500).json({ error: error.message || 'Error en auto-match' });
  }
});

// ─── POST /api/conciliation/match ───────────────────────────
// Confirma vínculo entre transacción bancaria y un Payment existente
// (o crea un Payment nuevo si se proporciona contractId+periodo).
const matchSchema = (req: Request) => req.body as {
  transactionId: string;
  paymentId?: string;
  contractId?: string;
  periodo?: number;
  matchScore?: number;
};

router.post('/match', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = matchSchema(req);

    if (!data.transactionId) return res.status(400).json({ error: 'Falta transactionId' });

    const tx = await prisma.bankTransaction.findUnique({ where: { id: data.transactionId } });
    if (!tx) return res.status(404).json({ error: 'Transacción no encontrada' });
    if (tx.matched) return res.status(400).json({ error: 'Esta transacción ya está conciliada' });

    let paymentId = data.paymentId;

    // Si no hay paymentId, crear el Payment desde la transacción bancaria
    if (!paymentId) {
      if (!data.contractId || !data.periodo) {
        return res.status(400).json({
          error: 'Para crear pago automáticamente se requiere contractId + periodo',
        });
      }

      const entry = await prisma.amortizationEntry.findFirst({
        where: { contractId: data.contractId, periodo: data.periodo },
      });
      if (!entry) return res.status(404).json({ error: 'Periodo no encontrado en amortización' });

      // Calcular distribución renta vs IVA
      const renta = Number(entry.renta);
      const iva = Number(entry.iva);
      const total = renta + iva;
      const txMonto = Number(tx.monto);
      const factor = txMonto / total;

      const newPayment = await prisma.payment.create({
        data: {
          contractId: data.contractId,
          userId,
          periodo: data.periodo,
          tipo: 'RENTA_ORDINARIA',
          fechaPago: tx.fecha,
          fechaVencimiento: entry.fechaPago,
          montoRenta: Math.round(renta * factor * 100) / 100,
          montoIVA: Math.round(iva * factor * 100) / 100,
          montoMoratorio: 0,
          montoIVAMoratorio: 0,
          montoTotal: txMonto,
          referencia: tx.referencia || `Conciliación bancaria ${tx.id.slice(0, 8)}`,
          observaciones: `Auto-creado desde estado de cuenta · ${tx.descripcion.slice(0, 80)}`,
        },
      });
      paymentId = newPayment.id;
    }

    const updated = await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        matched: true,
        paymentId,
        matchScore: data.matchScore || 100,
        matchedBy: userId,
        matchedAt: new Date(),
      },
    });

    res.json({ ok: true, transaction: { ...updated, monto: Number(updated.monto) }, paymentId });
  } catch (error: any) {
    log.error({ err: error }, 'Match error');
    res.status(500).json({ error: error.message || 'Error al conciliar' });
  }
});

// ─── POST /api/conciliation/unmatch ─────────────────────────
router.post('/unmatch', requireAuth, async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.body as { transactionId: string };
    const tx = await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        matched: false,
        paymentId: null,
        matchScore: null,
        matchedBy: null,
        matchedAt: null,
      },
    });
    res.json({ ok: true, transaction: { ...tx, monto: Number(tx.monto) } });
  } catch (error: any) {
    log.error({ err: error }, 'Unmatch error');
    res.status(500).json({ error: error.message || 'Error al deshacer conciliación' });
  }
});

// ─── DELETE /api/conciliation/statements/:id ────────────────
router.delete('/statements/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.bankStatement.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error: any) {
    log.error({ err: error }, 'Delete statement error');
    res.status(500).json({ error: error.message || 'Error al borrar estado de cuenta' });
  }
});

export default router;
