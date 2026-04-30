/**
 * cobranzaConcurrency.verify.ts — Verifica que POST /api/cobranza/pay
 * sea SEGURO ante concurrencia.
 *
 * Contexto:
 *   El handler antes leía prevPayments + calculaba split + creaba Payment
 *   sin transacción. Dos requests al mismo (contractId, periodo) leían el
 *   mismo estado vacío y creaban DOS Payments — doble cobro silencioso.
 *
 *   El fix (lib/serializableTransaction.ts) envuelve la sección crítica
 *   en prisma.$transaction con isolation level Serializable + retry en
 *   conflicto. Postgres aborta la TX perdedora con 40001 (P2034); el
 *   retry ya ve el Payment de la ganadora y o termina con error de
 *   negocio ("ya pagado") o aplica el monto restante.
 *
 * Este script:
 *   1. Busca un contrato real con tabla de amortización ya generada.
 *   2. Toma el primer periodo SIN pagos previos.
 *   3. Dispara DOS POST /pay con monto exacto del periodo, en paralelo.
 *   4. Verifica que SOLO HAY UN Payment en BD para ese (contract, periodo).
 *   5. Verifica que el response combinado refleja exactamente UN éxito
 *      y un fallo de negocio (400 — "ya pagado") tras el retry.
 *   6. Limpia: borra el Payment creado durante el test.
 *
 * Uso:
 *   npm run verify:cobranzaConcurrency
 *
 * Requisito: BD con al menos un Contract con amortizationEntries.
 *            En el seed actual de pruebas hay 4 contratos convertidos.
 */
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import prisma from '../config/db';
import cobranzaRoutes from '../routes/cobranza';
import { errorHandler } from '../middleware/errorHandler';

function makeToken(userId: string, rol: string): string {
  return jwt.sign(
    { userId, email: `${userId}@local`, rol },
    config.jwtSecret,
    { expiresIn: '5m' },
  );
}

interface CallResult<T = unknown> {
  status: number;
  body: T;
}

async function call<T = unknown>(
  port: number,
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<CallResult<T>> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* noop */
  }
  return { status: res.status, body: parsed as T };
}

let createdPaymentIds: string[] = [];

async function findTestPeriod() {
  // Buscamos un periodo (a) SIN pagos previos y (b) NO vencido (fechaPago
  // futura). El "no vencido" es importante: si el periodo está en mora,
  // calcConceptos calcula moratorios dinámicos, y con prelación legal el
  // primer pago consume moratorio + parte de la renta, dejando un
  // residuo pendiente. Para un test de race condition limpio queremos
  // que T1 cubra TODO el periodo y T2 vea estatus=PAGADO.
  const now = new Date();
  const entries = await prisma.amortizationEntry.findMany({
    where: { periodo: { gte: 1 }, fechaPago: { gt: now } },
    select: { id: true, contractId: true, periodo: true, renta: true, iva: true, pagoTotal: true, fechaPago: true },
    take: 200,
    orderBy: [{ fechaPago: 'asc' }],
  });

  for (const e of entries) {
    const pagos = await prisma.payment.count({
      where: { contractId: e.contractId, periodo: e.periodo },
    });
    if (pagos === 0) {
      return e;
    }
  }
  throw new Error(
    'No encontré ningún periodo futuro sin pagos previos en la BD. ' +
      'Necesitas al menos un Contract con amortizationEntries y un período libre. ' +
      'Si todos los contratos de prueba ya tienen pagos, borra los Payments del último ' +
      'periodo o crea un contrato nuevo desde el cotizador.',
  );
}

async function findAdminUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { rol: 'ADMIN', activo: true },
    select: { id: true },
  });
  if (!admin) throw new Error('No hay ADMIN activo en BD para el test');
  return admin.id;
}

async function main() {
  console.log('[cobranzaConcurrency] start');

  // ── App mini ────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // requireAuth + el handler usan req.id (de pino-http en prod). En el
    // mini-app sin pino, lo poblamos con un UUID determinista por test.
    (req as any).id = `verify-${Math.random().toString(36).slice(2, 10)}`;
    next();
  });
  app.use('/api/cobranza', cobranzaRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  console.log(`[cobranzaConcurrency] mini-app listening on :${port}`);

  let failures = 0;
  const expect = (cond: boolean, label: string, detail?: unknown) => {
    if (cond) {
      console.log(`  ✓ ${label}`);
    } else {
      console.error(`  ✗ ${label}`, detail ?? '');
      failures++;
    }
  };

  try {
    // ── Setup ────────────────────────────────────────────────────
    const adminId = await findAdminUserId();
    const token = makeToken(adminId, 'ADMIN');

    const entry = await findTestPeriod();
    console.log(
      `[cobranzaConcurrency] usando contract=${entry.contractId} periodo=${entry.periodo} pagoTotal=${entry.pagoTotal}`,
    );

    // Pago exacto del periodo (renta + IVA, sin moratorio porque vamos a
    // usar un periodo sin atraso de un contrato de pruebas).
    const monto = Number(entry.pagoTotal);

    // ── Test 1: dos POST /pay simultáneos al mismo periodo ────────
    console.log('[cobranzaConcurrency] disparando 2 pagos en paralelo...');
    const [r1, r2] = await Promise.all([
      call<{ payment?: { id: string }; aplicacion?: unknown; error?: unknown }>(
        port,
        'POST',
        '/api/cobranza/pay',
        token,
        { contractId: entry.contractId, periodo: entry.periodo, monto },
      ),
      call<{ payment?: { id: string }; aplicacion?: unknown; error?: unknown }>(
        port,
        'POST',
        '/api/cobranza/pay',
        token,
        { contractId: entry.contractId, periodo: entry.periodo, monto },
      ),
    ]);

    console.log(`[cobranzaConcurrency] r1.status=${r1.status}  r2.status=${r2.status}`);

    // Trackear los Payment IDs para limpieza al final.
    if (r1.body?.payment?.id) createdPaymentIds.push(r1.body.payment.id);
    if (r2.body?.payment?.id) createdPaymentIds.push(r2.body.payment.id);

    // Una respuesta 200 (la ganadora) y una 400 (la perdedora, tras retry vio
    // el período ya pagado). Cualquier otra combinación es bug.
    const successCount = [r1.status, r2.status].filter((s) => s === 200).length;
    const conflictCount = [r1.status, r2.status].filter((s) => s === 400).length;

    expect(
      successCount === 1,
      `exactamente UN response 200 (got ${successCount})`,
      { r1: r1.status, r2: r2.status },
    );
    expect(
      conflictCount === 1,
      `exactamente UN response 400 — perdedora vio "ya pagado" tras retry (got ${conflictCount})`,
      { r1: r1.status, r2: r2.status },
    );

    // ── Test 2: BD tiene exactamente 1 Payment para ese período ───
    const paymentsInDb = await prisma.payment.findMany({
      where: { contractId: entry.contractId, periodo: entry.periodo },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      paymentsInDb.length === 1,
      `BD: exactamente 1 Payment para ese periodo (got ${paymentsInDb.length})`,
      paymentsInDb.map((p) => ({ id: p.id, total: Number(p.montoTotal) })),
    );

    // El Payment registrado debe cubrir renta+IVA (los buckets que vivieron
    // dentro de la TX). NO comparamos contra monto entero porque pagoTotal
    // del entry puede incluir conceptos extra (seguro financiado) que no
    // entran en buckets — esos quedan como "sobrante" en observaciones.
    const expectedApplied = Number(entry.renta) + Number(entry.iva);
    if (paymentsInDb.length === 1) {
      const p = paymentsInDb[0];
      const totalApplied = Number(p.montoTotal);
      expect(
        Math.abs(totalApplied - expectedApplied) < 0.05,
        `montoTotal del Payment ≈ renta+IVA (esperado ${expectedApplied.toFixed(2)}, got ${totalApplied.toFixed(2)})`,
      );
      // El total NO debe ser ≈ 2× expected (lo que pasaría sin transacción).
      expect(
        Math.abs(totalApplied - expectedApplied * 2) > 0.5,
        `montoTotal NO se duplicó (sin TX hubiera sido ~${(expectedApplied * 2).toFixed(2)})`,
      );
    }

    // ── Test 3: El segundo response trae el mensaje correcto ─────
    const errorResponse = r1.status === 400 ? r1 : r2;
    const errorMsg =
      typeof (errorResponse.body as any)?.error === 'string'
        ? ((errorResponse.body as any).error as string)
        : ((errorResponse.body as any)?.error?.message ?? '');
    expect(
      errorMsg.toLowerCase().includes('pagado'),
      `mensaje de error menciona "pagado" (got: "${errorMsg}")`,
    );

    // ── Cleanup ──────────────────────────────────────────────────
    if (createdPaymentIds.length > 0) {
      await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
      console.log(`[cobranzaConcurrency] cleanup: ${createdPaymentIds.length} Payment(s) borrado(s)`);
    }
    // Por si quedaron payments del periodo desde un test fallado anteriormente
    // (limpieza defensiva — no toca otros periodos).
    const orphans = await prisma.payment.deleteMany({
      where: {
        contractId: entry.contractId,
        periodo: entry.periodo,
        observaciones: { contains: 'Sobrante:', mode: 'insensitive' },
      },
    });
    if (orphans.count > 0) {
      console.log(`[cobranzaConcurrency] cleanup defensivo: ${orphans.count} Payment(s) órfanos del test borrado(s)`);
    }
  } catch (err) {
    console.error('[cobranzaConcurrency] FATAL', err);
    failures++;
  } finally {
    // Si quedaron payments creados durante el test que no fueron limpiados, hacerlo.
    if (createdPaymentIds.length > 0) {
      await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } }).catch(() => {});
    }
    server.close();
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`[cobranzaConcurrency] FAIL — ${failures} check(s) fallaron`);
    process.exit(1);
  }
  console.log('[cobranzaConcurrency] PASS — race condition cerrada correctamente');
  process.exit(0);
}

main();
