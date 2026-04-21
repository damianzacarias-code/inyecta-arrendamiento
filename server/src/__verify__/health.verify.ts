/**
 * Verifica las DOS ramas del /api/health real:
 *   1) DB OK   → 200 + status:'ok' + db.latencyMs numérico
 *   2) DB DOWN → 503 + status:'degraded' + db.error con mensaje
 *
 * Para la rama down NO tocamos el Postgres del usuario: levantamos un
 * cliente Prisma apuntando a un puerto muerto (54399) y montamos el
 * MISMO handler que index.ts en una mini-app.
 *
 * Ejecutar: npx tsx src/__verify__/health.verify.ts
 */
import express from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

// ───────────────────────────────────────────────────────────────────
// Réplica EXACTA del handler /api/health de index.ts (no se importa
// porque index.ts arranca un listener; lo duplicamos aquí 1:1).
// Si esto se desync con index.ts, el test deja de proteger nada.
// ───────────────────────────────────────────────────────────────────
function makeHealthHandler(prisma: PrismaClient) {
  return async (_req: express.Request, res: express.Response) => {
    const startedAt = Date.now();
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('DB ping timeout (>3000ms)')), 3000),
        ),
      ]);
      const latencyMs = Date.now() - startedAt;
      res.json({
        status: 'ok',
        db: { status: 'ok', latencyMs },
        uptime: process.uptime(),
        env: 'verify',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      res.status(503).json({
        status: 'degraded',
        db: { status: 'fail', latencyMs, error: message },
        uptime: process.uptime(),
        env: 'verify',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

function get(port: number, path: string): Promise<{status: number; body: string}> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let passed = 0; let failed = 0;

  // ── Caso A: DB OK ─────────────────────────────────────────────
  {
    const prisma = new PrismaClient(); // usa DATABASE_URL del .env
    const app = express();
    app.get('/api/health', makeHealthHandler(prisma));
    const server = app.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no addr');
    const r = await get(addr.port, '/api/health');
    let parsed: { status?: string; db?: { status?: string; latencyMs?: number } } = {};
    try { parsed = JSON.parse(r.body); } catch { /* */ }
    const ok = r.status === 200 && parsed.status === 'ok' && parsed.db?.status === 'ok' && typeof parsed.db?.latencyMs === 'number';
    if (ok) { console.log(`  ✓ DB OK    → 200 status:ok latency:${parsed.db?.latencyMs}ms`); passed++; }
    else    { console.log(`  ✗ DB OK    → got ${r.status} ${r.body}`); failed++; }
    await prisma.$disconnect();
    server.close();
  }

  // ── Caso B: DB DOWN (puerto muerto) ───────────────────────────
  {
    const deadUrl = 'postgresql://postgres:postgres@127.0.0.1:54399/nada';
    const prisma = new PrismaClient({
      datasources: { db: { url: deadUrl } },
      log: ['error'],
    });
    const app = express();
    app.get('/api/health', makeHealthHandler(prisma));
    const server = app.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no addr');
    const r = await get(addr.port, '/api/health');
    let parsed: { status?: string; db?: { status?: string; error?: string } } = {};
    try { parsed = JSON.parse(r.body); } catch { /* */ }
    const ok = r.status === 503 && parsed.status === 'degraded' && parsed.db?.status === 'fail' && typeof parsed.db?.error === 'string' && parsed.db.error.length > 0;
    if (ok) { console.log(`  ✓ DB DOWN  → 503 status:degraded error:"${parsed.db?.error?.slice(0,60)}…"`); passed++; }
    else    { console.log(`  ✗ DB DOWN  → got ${r.status} ${r.body.slice(0, 200)}`); failed++; }
    await prisma.$disconnect().catch(() => { /* sin drama */ });
    server.close();
  }

  console.log(`\n  ${passed}/${passed+failed} casos OK`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
