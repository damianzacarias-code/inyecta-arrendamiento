/**
 * Verifica que GET /api/config/catalog responde con el shape esperado:
 *   { catalog: {tasas, comisiones, gps, multiplicador},
 *     riskPresets: [A, B, C] }
 *
 * No prueba auth (lo hace requireAuth en runtime). Lo que validamos
 * aquí es la forma serializada — que Decimal de Prisma se entrega como
 * número y que las refines (min ≤ default ≤ max) se respetan en BD.
 *
 * Requiere DB up. Correr cuando se cambie routes/catalog.ts:
 *   npx tsx src/__verify__/catalog.verify.ts
 */
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import catalogConfigRoutes from '../routes/catalog';

// Generamos un JWT real para pasar requireAuth — no tiene sentido
// stub-ear el middleware: el handler SÍ usa req.user.userId al
// guardar el editor. Si falla la firma, el verify aborta limpio.
function makeToken(): string {
  return jwt.sign(
    { userId: 'verify-script', email: 'verify@local', rol: 'ADMIN' },
    config.jwtSecret,
    { expiresIn: '5m' },
  );
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/config', catalogConfigRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  const token = makeToken();
  const res = await fetch(`http://127.0.0.1:${port}/api/config/catalog`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await res.json()) as any;

  const c = body?.catalog;
  const presets = body?.riskPresets ?? [];
  const niveles = new Set(presets.map((p: { nivel: string }) => p.nivel));

  const checks: Array<[string, unknown]> = [
    ['HTTP 200',                                res.status === 200],
    ['catalog.clave === "default"',             c?.clave === 'default'],
    ['tasaAnualDefault es número',              typeof c?.tasaAnualDefault === 'number'],
    ['tasaAnualMin ≤ default ≤ Max',
      typeof c?.tasaAnualMin === 'number' &&
        c.tasaAnualMin <= c.tasaAnualDefault &&
        c.tasaAnualDefault <= c.tasaAnualMax],
    ['comisionMin ≤ default ≤ Max',
      typeof c?.comisionAperturaMin === 'number' &&
        c.comisionAperturaMin <= c.comisionAperturaDefault &&
        c.comisionAperturaDefault <= c.comisionAperturaMax],
    ['gpsMontoDefault es número ≥ 0',           typeof c?.gpsMontoDefault === 'number' && c.gpsMontoDefault >= 0],
    ['gpsFinanciableDefault es boolean',        typeof c?.gpsFinanciableDefault === 'boolean'],
    ['tasaMoratoriaMultiplier ∈ [1,5]',
      typeof c?.tasaMoratoriaMultiplier === 'number' &&
        c.tasaMoratoriaMultiplier >= 1 &&
        c.tasaMoratoriaMultiplier <= 5],
    ['riskPresets es array',                    Array.isArray(presets)],
    ['preset A presente',                       niveles.has('A')],
    ['preset B presente',                       niveles.has('B')],
    ['preset C presente',                       niveles.has('C')],
    ['preset.depositoPuroPct es número',        typeof presets[0]?.depositoPuroPct === 'number'],
    ['preset.engancheFinPct es número',         typeof presets[0]?.engancheFinPct === 'number'],
  ];

  console.log('GET /api/config/catalog:');
  console.log(JSON.stringify(body, null, 2).slice(0, 1200));
  console.log('');

  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failed += 1;
  }

  console.log('');
  console.log(failed === 0 ? 'OK · todos los checks pasaron' : `FAIL · ${failed} check(s) fallaron`);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verify error:', err);
  process.exit(1);
});
