/**
 * passwordPolicy.verify.ts — Verificación end-to-end de la política
 * de contraseñas (CLAUDE.md §10 — Hardening S1).
 *
 * NO es un test unitario; corre contra Postgres real con un usuario
 * verify-* que crea, prueba y borra. Si la corrida cae a la mitad,
 * ejecutar `psql ... -c "DELETE FROM users WHERE email LIKE 'verify-pw-%'"`
 * para limpiar.
 *
 * Cómo correrlo:
 *   npm run verify:passwords
 *
 * Lo que valida (24 checks):
 *   1-13. validatePasswordStrength rechaza contraseñas débiles por
 *         cada categoría (corta, sin minúscula, sin mayúscula, sin
 *         dígito, sin símbolo, patrón trivial, contiene email/nombre).
 *   14.   Una contraseña fuerte pasa sin violaciones.
 *   15.   assertPasswordStrong lanza AppError con detalles.
 *   16-19. Flujo end-to-end con prisma:
 *           crear usuario, cambiar password, verificar historial,
 *           rechazar reuso.
 *   20.   El historial se recorta a PASSWORD_HISTORY_DEPTH.
 *   21.   setPassword con mustChange=true marca el flag.
 *   22.   passwordChangedAt se actualiza en cada cambio.
 *   23.   bcrypt.compare verifica que el hash persistido es válido.
 *   24.   Cleanup: borra usuario + historial.
 */
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import {
  validatePasswordStrength,
  assertPasswordStrong,
  setPassword,
  changePassword,
  assertNotReusedRecently,
  hashPassword,
  PASSWORD_HISTORY_DEPTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/passwordPolicy';
import { AppError } from '../middleware/errorHandler';

interface CheckResult {
  name:    string;
  ok:      boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrow(
  name: string,
  fn: () => Promise<void> | void,
  expectedCode?: string,
) {
  try {
    await fn();
    check(name, false, 'esperaba error pero no lanzó');
  } catch (err) {
    if (err instanceof AppError) {
      const ok = !expectedCode || err.code === expectedCode;
      check(name, ok, `${err.code}: ${err.message}`);
    } else {
      check(name, false, `error inesperado: ${(err as Error).message}`);
    }
  }
}

async function main() {
  console.log('\n=== Política de contraseñas — verificación ===\n');

  // ── Bloque 1: validatePasswordStrength puro ──────────────────────
  console.log('Bloque 1 · validatePasswordStrength (puro)');

  check(
    '1. password vacío → TOO_SHORT',
    validatePasswordStrength('').includes('TOO_SHORT'),
  );
  check(
    '2. password 5 chars → TOO_SHORT',
    validatePasswordStrength('Ab1!x').includes('TOO_SHORT'),
  );
  check(
    `3. password ${PASSWORD_MIN_LENGTH} chars sin upper → MISSING_UPPER`,
    validatePasswordStrength('abc12345!@').includes('MISSING_UPPER'),
  );
  check(
    '4. password sin lower → MISSING_LOWER',
    validatePasswordStrength('ABC12345!@').includes('MISSING_LOWER'),
  );
  check(
    '5. password sin digit → MISSING_DIGIT',
    validatePasswordStrength('Abcdefgh!@').includes('MISSING_DIGIT'),
  );
  check(
    '6. password sin símbolo → MISSING_SYMBOL',
    validatePasswordStrength('Abcdef1234').includes('MISSING_SYMBOL'),
  );
  check(
    '7. patrón trivial "Password1!" → TRIVIAL_PATTERN',
    validatePasswordStrength('Password1!').includes('TRIVIAL_PATTERN'),
  );
  check(
    '8. patrón trivial "Qwerty123!" → TRIVIAL_PATTERN',
    validatePasswordStrength('Qwerty123!').includes('TRIVIAL_PATTERN'),
  );
  check(
    '9. patrón trivial "Inyecta2026!" → TRIVIAL_PATTERN',
    validatePasswordStrength('Inyecta2026!').includes('TRIVIAL_PATTERN'),
  );
  check(
    '10. contiene email → CONTAINS_PERSONAL_DATA',
    validatePasswordStrength('Damian1234!', { email: 'damian@inyecta.mx' })
      .includes('CONTAINS_PERSONAL_DATA'),
  );
  check(
    '11. contiene nombre → CONTAINS_PERSONAL_DATA',
    validatePasswordStrength('Roberto1234!', { nombre: 'Roberto', apellidos: 'Pérez' })
      .includes('CONTAINS_PERSONAL_DATA'),
  );
  check(
    '12. contiene apellido → CONTAINS_PERSONAL_DATA',
    validatePasswordStrength('Mendoza1234!', { nombre: 'Ana', apellidos: 'Mendoza López' })
      .includes('CONTAINS_PERSONAL_DATA'),
  );
  check(
    '13. whitespace al borde → WHITESPACE_NOT_ALLOWED',
    validatePasswordStrength(' Strong1234! ').includes('WHITESPACE_NOT_ALLOWED'),
  );
  check(
    '14. contraseña fuerte → 0 violaciones',
    validatePasswordStrength('VbT9!kLq2#mP', { email: 'pepe@test.com', nombre: 'Pepe', apellidos: 'González' })
      .length === 0,
  );

  // ── Bloque 2: assertPasswordStrong lanza AppError ─────────────────
  console.log('\nBloque 2 · assertPasswordStrong');

  await expectThrow(
    '15. assertPasswordStrong("123") lanza WEAK_PASSWORD',
    () => assertPasswordStrong('123'),
    'WEAK_PASSWORD',
  );

  // ── Bloque 3: flujo end-to-end con BD ─────────────────────────────
  console.log('\nBloque 3 · Flujo end-to-end (Postgres)');

  const testEmail = `verify-pw-${Date.now()}@inyecta.test`;
  const initialPassword = 'InitialP@ssw0rd!';
  const created = await prisma.user.create({
    data: {
      email:    testEmail,
      password: await hashPassword(initialPassword),
      nombre:   'Verify',
      apellidos: 'Test',
      rol:      'ANALISTA',
    },
  });
  check('16. usuario creado', !!created.id, created.id);

  // Cambiar contraseña varias veces para llenar historial.
  // Necesitamos PASSWORD_HISTORY_DEPTH+2 cambios para probar el recorte.
  const passwords = [
    'TheBlu3Sky#42!',
    'GreenForest@7Q',
    'YellowSun%99zL',
    'PurpleMoon&88vC',
    'OrangeStorm$11dN',
    'WhiteCloud!22bW',
    'PinkRiver?33tM',
  ];

  for (let i = 0; i < passwords.length; i++) {
    await changePassword(created.id, passwords[i], {
      email:     testEmail,
      nombre:    'Verify',
      apellidos: 'Test',
    });
  }
  check(`17. ${passwords.length} cambios consecutivos OK`, true);

  // Reuso de la actual (la última aplicada).
  await expectThrow(
    '18. reuso de la contraseña actual → PASSWORD_REUSE',
    () => assertNotReusedRecently(created.id, passwords[passwords.length - 1]),
    'PASSWORD_REUSE',
  );

  // Reuso de una en historial reciente (la penúltima aplicada).
  await expectThrow(
    '19. reuso de pass anterior reciente → PASSWORD_REUSE',
    () => assertNotReusedRecently(created.id, passwords[passwords.length - 2]),
    'PASSWORD_REUSE',
  );

  // ── Bloque 4: historial recortado al límite ──────────────────────
  console.log('\nBloque 4 · Historial');

  const historyCount = await prisma.passwordHistory.count({
    where: { userId: created.id },
  });
  check(
    `20. historial recortado a ${PASSWORD_HISTORY_DEPTH} entradas`,
    historyCount === PASSWORD_HISTORY_DEPTH,
    `tiene ${historyCount} (esperado ${PASSWORD_HISTORY_DEPTH})`,
  );

  // ── Bloque 5: mustChangePassword + passwordChangedAt ─────────────
  console.log('\nBloque 5 · Flags');

  await setPassword(created.id, 'NewSafe1!QqRr', { mustChange: true });
  const afterMustChange = await prisma.user.findUnique({
    where: { id: created.id },
    select: { mustChangePassword: true, passwordChangedAt: true, password: true },
  });
  check(
    '21. setPassword(mustChange=true) marca el flag',
    afterMustChange?.mustChangePassword === true,
  );
  // passwordChangedAt actualizado: tomamos margen amplio (1 minuto)
  // por si el reloj del Postgres y el de Node difieren.
  const ageMs = Date.now() - (afterMustChange?.passwordChangedAt?.getTime() ?? 0);
  check(
    '22. passwordChangedAt actualizado',
    ageMs < 60_000,
    `hace ${ageMs}ms`,
  );

  // bcrypt.compare debe verdad sobre el hash persistido.
  const compareOk = await bcrypt.compare('NewSafe1!QqRr', afterMustChange?.password ?? '');
  check('23. hash persistido verifica con bcrypt.compare', compareOk);

  // ── Cleanup ──────────────────────────────────────────────────────
  console.log('\nCleanup');
  await prisma.passwordHistory.deleteMany({ where: { userId: created.id } });
  await prisma.user.delete({ where: { id: created.id } });
  check('24. cleanup OK', true);

  // ── Resumen ──────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const total  = results.length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${passed}/${total} OK${passed === total ? ' ✓' : ' ✗'}`);
  if (passed !== total) {
    console.log('\nFallidos:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name} ${r.detail ?? ''}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error fatal:', err);
  // Mejor esfuerzo de cleanup
  await prisma.user
    .deleteMany({ where: { email: { startsWith: 'verify-pw-' } } })
    .catch(() => {});
  process.exit(1);
});
