/**
 * vitest.config.ts — Configuración de tests del backend.
 *
 * Filosofía: tests UNITARIOS y rápidos sobre los módulos del server que
 * NO requieren BD ni red. Para verificación end-to-end (Prisma real,
 * Express real) seguimos usando los scripts standalone de
 * `src/__verify__/*.verify.ts` — esos NO se corren en `npm test` porque
 * dependen de la BD del usuario.
 *
 * Convención:
 *   - Nombre de archivo: `*.test.ts` (los .verify.ts quedan excluidos).
 *   - Ubicación: junto al módulo bajo `__tests__/` (igual que el cliente).
 *   - LOG_LEVEL=silent en tests para que pino no contamine stdout.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    // Excluir los scripts de verificación end-to-end y el seed.
    exclude: ['node_modules', 'dist', 'src/__verify__/**', 'src/seed*.ts'],
    environment: 'node',
    globals: false,
    // Pino imprime fatal/error a stderr en tests; lo silenciamos.
    env: {
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      // Defaults mínimos para que `config/env.ts` no falle al cargar
      // (lo importan algunos módulos bajo prueba indirectamente).
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-only-for-vitest-do-not-use-anywhere-else-32',
      // Forzar MOCK en tests. Sin esto, si el .env local del dev tiene
      // EXTRACT_PROVIDER=CLAUDE, Zod aborta porque vitest no expone una
      // ANTHROPIC_API_KEY válida (y además no queremos que los tests
      // le pidan a la red real de Anthropic).
      EXTRACT_PROVIDER: 'MOCK',
      ANTHROPIC_API_KEY: '',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/__verify__/**',
        'src/seed*.ts',
        'src/index.ts', // bootstrap, no testeable como unidad
      ],
    },
  },
});
