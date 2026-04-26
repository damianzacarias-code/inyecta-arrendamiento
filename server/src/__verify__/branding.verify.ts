/**
 * Verifica que GET /api/config/branding devuelve el shape esperado:
 * { empresa:{razonSocial,nombreComercial}, contacto:{...}, banco:{...} }
 *
 * Correr cuando se cambie env.ts o routes/branding.ts:
 *   npx tsx src/__verify__/branding.verify.ts
 */
import express from 'express';
import http from 'http';
import brandingRoutes from '../routes/branding';

async function main() {
  const app = express();
  app.use('/api/config', brandingRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  const res = await fetch(`http://127.0.0.1:${port}/api/config/branding`);
  const body = await res.json();

  const checks: Array<[string, unknown]> = [
    ['HTTP 200',                  res.status === 200],
    ['empresa.razonSocial',       typeof body?.empresa?.razonSocial === 'string'],
    ['empresa.nombreComercial',   typeof body?.empresa?.nombreComercial === 'string'],
    ['contacto.direccion',        typeof body?.contacto?.direccion === 'string'],
    ['contacto.telefonos',        typeof body?.contacto?.telefonos === 'string'],
    ['contacto.email contiene @', String(body?.contacto?.email).includes('@')],
    ['contacto.web',              typeof body?.contacto?.web === 'string'],
    ['banco.nombre',              typeof body?.banco?.nombre === 'string'],
    ['banco.clabe',               typeof body?.banco?.clabe === 'string'],
    ['banco.beneficiario',        typeof body?.banco?.beneficiario === 'string'],
  ];

  const fallidos = checks.filter(([, ok]) => !ok);
  console.log('GET /api/config/branding:');
  console.log(JSON.stringify(body, null, 2));
  console.log('');
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verify error:', err);
  process.exit(1);
});
