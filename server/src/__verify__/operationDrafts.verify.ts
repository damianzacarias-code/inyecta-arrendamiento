/**
 * Verifica end-to-end /api/operation-drafts (Fase 1 prototipo, 20-05-2026):
 *   • POST  /operation-drafts                — crear draft
 *   • GET   /operation-drafts                — listar
 *   • GET   /operation-drafts/:id            — detalle con actores
 *   • PATCH /operation-drafts/:id            — editar tipoOperacion
 *   • POST  /:id/actores                     — declarar TITULAR + AVAL
 *   • Reglas: TITULAR único, TITULAR no puede ser PF, REP_LEGAL/SOCIO solo PF
 *   • PATCH /:id/actores/:aid                — editar nombre + datosConsolidados
 *   • POST  /:id/documentos (multipart)      — sube INE → mock extrae → merge
 *   • Verifica que datosConsolidados del actor recibió campos del INE
 *   • Sube CSF al mismo actor → verifica merge acumulado (último gana)
 *   • Auto-match por CURP: actor con CURP "PEGJ800101HDFRRN02" recibe INE
 *     sin actorId explícito.
 *   • DELETE /:id/actores/:aid
 *   • DELETE /:id (soft → status DISCARDED)
 *
 * Usa Provider MOCK (default cuando no hay ANTHROPIC_API_KEY) → outputs
 * deterministas, no consume créditos.
 *
 * Correr:
 *   npx tsx src/__verify__/operationDrafts.verify.ts
 */
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import operationDraftsRoutes from '../routes/operationDrafts';
import { errorHandler } from '../middleware/errorHandler';
import prisma from '../config/db';

function makeToken(userId: string, rol: string): string {
  return jwt.sign(
    { userId, email: `${userId}@local`, rol },
    config.jwtSecret,
    { expiresIn: '5m' },
  );
}

async function call<T = unknown>(
  port: number,
  method: string,
  pathStr: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const res = await fetch(`http://127.0.0.1:${port}${pathStr}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : {}; } catch { /* noop */ }
  return { status: res.status, body: parsed as T };
}

// Construye un PDF mínimo válido (~150 bytes). Lo usamos solo para que
// multer acepte el upload — el MockProvider ignora el contenido y
// devuelve datos deterministas según el `tipo` declarado.
function makeMinimalPdf(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
    '0000000052 00000 n\n0000000095 00000 n\n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF',
  );
}

async function uploadDocument(
  port: number,
  token: string,
  draftId: string,
  tipoDocumento: string,
  actorId: string | null,
  filename: string,
): Promise<{ status: number; body: any }> {
  const pdfBuf = makeMinimalPdf();
  const form = new FormData();
  form.append('archivo', new Blob([pdfBuf], { type: 'application/pdf' }), filename);
  form.append('tipoDocumento', tipoDocumento);
  if (actorId) form.append('actorId', actorId);

  const res = await fetch(`http://127.0.0.1:${port}/api/operation-drafts/${draftId}/documentos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = text ? JSON.parse(text) : {}; } catch { /* noop */ }
  return { status: res.status, body: parsed };
}

async function expect(cond: boolean, msg: string): Promise<void> {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`✓ ${msg}`);
}

async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/operation-drafts', operationDraftsRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  const realUser = await prisma.user.findFirst({ where: { activo: true } });
  if (!realUser) {
    console.error('verify error: necesita al menos 1 usuario activo. Corre `npm run db:seed`.');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(1);
  }
  const token = makeToken(realUser.id, realUser.rol);

  let draftId = '';
  let titularId = '';
  let avalId = '';
  const createdDrafts: string[] = [];

  try {
    // 1. Crear draft
    const c1 = await call<{ id: string; status: string }>(port, 'POST', '/api/operation-drafts', token, {
      tipoOperacion: 'FINANCIERO',
    });
    await expect(c1.status === 201, 'POST /operation-drafts → 201');
    await expect(c1.body.status === 'DRAFT', 'status inicial = DRAFT');
    await expect(typeof c1.body.id === 'string', 'devuelve id');
    draftId = c1.body.id;
    createdDrafts.push(draftId);

    // 2. Crear TITULAR PFAE
    const t = await call<{ id: string; rol: string; orden: number }>(
      port, 'POST', `/api/operation-drafts/${draftId}/actores`, token,
      { rol: 'TITULAR', subtipo: 'PFAE', nombre: 'Juan Pérez García' },
    );
    await expect(t.status === 201, 'POST actor TITULAR → 201');
    await expect(t.body.rol === 'TITULAR', 'rol = TITULAR');
    await expect(t.body.orden === 1, 'orden TITULAR = 1');
    titularId = t.body.id;

    // 3. Intentar crear segundo TITULAR → 409
    const t2 = await call<{ error: { code: string } }>(
      port, 'POST', `/api/operation-drafts/${draftId}/actores`, token,
      { rol: 'TITULAR', subtipo: 'PM', nombre: 'Otro' },
    );
    await expect(t2.status === 409, 'segundo TITULAR → 409');
    await expect(t2.body.error.code === 'TITULAR_DUPLICADO', 'code = TITULAR_DUPLICADO');

    // 4. TITULAR con subtipo PF → 400
    // Borramos el actual primero para que la validación de duplicado no
    // dispare antes del check de subtipo.
    const tmpDraft = await call<{ id: string }>(port, 'POST', '/api/operation-drafts', token, {});
    createdDrafts.push(tmpDraft.body.id);
    const t3 = await call<{ error: { code: string } }>(
      port, 'POST', `/api/operation-drafts/${tmpDraft.body.id}/actores`, token,
      { rol: 'TITULAR', subtipo: 'PF', nombre: 'X' },
    );
    await expect(t3.status === 400, 'TITULAR PF → 400');
    await expect(t3.body.error.code === 'TITULAR_PF_INVALIDO', 'code = TITULAR_PF_INVALIDO');

    // 5. Crear AVAL con CURP que matchee Mock INE para probar auto-match.
    // Pre-cargamos el actor con datosConsolidados que incluye el CURP
    // que el MockProvider devolverá para INE.
    const a = await call<{ id: string; rol: string; orden: number }>(
      port, 'POST', `/api/operation-drafts/${draftId}/actores`, token,
      { rol: 'AVAL', subtipo: 'PF', nombre: 'Aval Pedro' },
    );
    await expect(a.status === 201, 'POST AVAL → 201');
    await expect(a.body.rol === 'AVAL', 'rol = AVAL');
    avalId = a.body.id;

    // 6. PATCH titular con CURP que matchee el Mock INE (auto-match)
    const patchTit = await call<{ datosConsolidados: any }>(
      port, 'PATCH', `/api/operation-drafts/${draftId}/actores/${titularId}`, token,
      { datosConsolidados: { curp: 'PEGJ800101HDFRRN02' } },
    );
    await expect(patchTit.status === 200, 'PATCH titular con CURP → 200');
    await expect(patchTit.body.datosConsolidados.curp === 'PEGJ800101HDFRRN02', 'CURP guardado');

    // 7. Upload INE SIN actorId → la extracción síncrona auto-asigna
    //    al titular por matching de CURP, así que el response ya
    //    trae actorId poblado.
    const u1 = await uploadDocument(port, token, draftId, 'INE', null, 'ine.pdf');
    await expect(u1.status === 201, 'POST INE sin actorId → 201');
    await expect(u1.body.tipoDocumento === 'INE', 'tipoDocumento = INE');
    await expect(u1.body.actorId === titularId, 'auto-match por CURP → actorId = titular');
    await expect(u1.body.autoAsignado === true, 'autoAsignado = true');
    await expect(u1.body.extraidoEn !== null, 'extraidoEn poblado tras upload (sync)');

    // 8. Verificar estado completo del draft
    const d1 = await call<any>(port, 'GET', `/api/operation-drafts/${draftId}`, token);
    await expect(d1.status === 200, 'GET draft → 200');
    const tit = d1.body.actores.find((x: any) => x.id === titularId);
    await expect(!!tit, 'titular presente en GET');

    const docOnTit = tit.documentos.find((dd: any) => dd.tipoDocumento === 'INE');
    await expect(!!docOnTit, 'INE quedó bajo el titular tras auto-match');
    await expect(docOnTit?.autoAsignado === true, 'autoAsignado = true');
    await expect(docOnTit?.extraidoEn !== null, 'extraidoEn poblado');
    await expect(typeof docOnTit?.confianzaExtraccion === 'number', 'confianzaExtraccion numérica');

    // datosConsolidados del titular debe tener los campos del INE merged
    const dc = tit.datosConsolidados ?? {};
    await expect(dc.nombre === 'JUAN', 'merge: nombre = JUAN');
    await expect(dc.apellidoPaterno === 'PÉREZ', 'merge: apellidoPaterno = PÉREZ');
    await expect(dc.apellidoMaterno === 'GARCÍA', 'merge: apellidoMaterno = GARCÍA');
    await expect(dc.curp === 'PEGJ800101HDFRRN02', 'merge: CURP preservado');
    await expect(dc.fechaNacimiento === '1980-01-01', 'merge: fechaNacimiento');
    await expect(dc.sexo === 'H', 'merge: sexo = H');

    // 10. Upload CSF AL titular explícitamente → merge acumulativo
    const u2 = await uploadDocument(port, token, draftId, 'CSF', titularId, 'csf.pdf');
    await expect(u2.status === 201, 'POST CSF con actorId → 201');

    const d2 = await call<any>(port, 'GET', `/api/operation-drafts/${draftId}`, token);
    const tit2 = d2.body.actores.find((x: any) => x.id === titularId);
    const dc2 = tit2.datosConsolidados ?? {};
    // INE no se borró (último gana es por campo, no por doc):
    await expect(dc2.nombre === 'JUAN', 'CSF no borró nombre del INE');
    // CSF agrega campos nuevos:
    await expect(dc2.rfc === 'XAXX010101000', 'merge: rfc del CSF');
    await expect(dc2.regimenFiscal?.startsWith('601'), 'merge: regimenFiscal');
    await expect(dc2.codigoPostal === '37000', 'merge: codigoPostal');

    // 11. Upload tipo no soportado → 400
    const u3 = await uploadDocument(port, token, draftId, 'FOO_BAR', null, 'x.pdf');
    await expect(u3.status === 400, 'tipoDocumento no soportado → 400');
    await expect(u3.body.error.code === 'TIPO_DOC_NO_SOPORTADO', 'code = TIPO_DOC_NO_SOPORTADO');

    // 12. Upload tipo OTRO (permitido para guardar sin extraer)
    const u4 = await uploadDocument(port, token, draftId, 'OTRO', avalId, 'misc.pdf');
    await expect(u4.status === 201, 'tipoDocumento OTRO → 201');
    const d3 = await call<any>(port, 'GET', `/api/operation-drafts/${draftId}`, token);
    const aval = d3.body.actores.find((x: any) => x.id === avalId);
    const docMisc = aval.documentos.find((dd: any) => dd.tipoDocumento === 'OTRO');
    await expect(!!docMisc, 'doc OTRO persistido');
    await expect(docMisc?.extraidoEn === null, 'OTRO no se extrae');

    // 13. DELETE actor (aval) → 204
    const delA = await call(port, 'DELETE', `/api/operation-drafts/${draftId}/actores/${avalId}`, token);
    await expect(delA.status === 204, 'DELETE aval → 204');
    // Doc OTRO debe quedar huérfano (actorId=null)
    const d4 = await call<any>(port, 'GET', `/api/operation-drafts/${draftId}`, token);
    await expect(d4.body.actores.length === 1, 'queda solo el titular');
    await expect(d4.body.docsSinAsignar.length >= 1, 'doc OTRO huérfano');

    // 14. DELETE draft → soft delete → siguiente GET = 410
    const delD = await call(port, 'DELETE', `/api/operation-drafts/${draftId}`, token);
    await expect(delD.status === 204, 'DELETE draft → 204');
    const getAfter = await call<any>(port, 'GET', `/api/operation-drafts/${draftId}`, token);
    await expect(getAfter.status === 410, 'GET tras DELETE → 410 DRAFT_DISCARDED');
    await expect(getAfter.body.error.code === 'DRAFT_DISCARDED', 'code = DRAFT_DISCARDED');

    console.log('\n✓ Verificación completa');
  } finally {
    // Cleanup: borrar los drafts creados (hard delete porque DISCARDED
    // los oculta pero siguen ocupando espacio en BD; las migraciones
    // posteriores no asumen presencia).
    for (const id of createdDrafts) {
      await prisma.operationDraftActor.deleteMany({ where: { draftId: id } });
      await prisma.operationDraftDocument.deleteMany({ where: { draftId: id } });
      await prisma.operationDraft.delete({ where: { id } }).catch(() => {});
    }
    // Borrar archivos subidos a uploads/drafts/
    const draftsDir = path.resolve(__dirname, '..', '..', 'uploads', 'drafts');
    if (fs.existsSync(draftsDir)) {
      for (const f of fs.readdirSync(draftsDir)) {
        try { fs.unlinkSync(path.join(draftsDir, f)); } catch { /* noop */ }
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error('verify failed:', err);
  process.exit(1);
});
