/**
 * pdfExtract/index.ts — Factory pública del módulo de extracción.
 *
 * Uso típico:
 *   import { getExtractProvider } from '../services/pdfExtract';
 *   const provider = getExtractProvider();
 *   const res = await provider.extract(buffer, 'application/pdf', 'CSF');
 *
 * `getExtractProvider()` decide qué implementación usar según
 * `config.extract.provider`:
 *   - MOCK   → MockProvider (sin red).
 *   - CLAUDE → ClaudeProvider (requiere ANTHROPIC_API_KEY).
 *
 * Si EXTRACT_PROVIDER=CLAUDE pero falta la key, `getExtractProvider()`
 * lanza un Error legible inmediatamente — los routes que lo usan
 * deben envolver en try/catch y devolver 503 EXTRACT_DISABLED.
 */
import { config } from '../../config/env';
import { ClaudeProvider } from './ClaudeProvider';
import { MockProvider } from './MockProvider';
import type { IExtractProvider } from './types';

let _cachedProvider: IExtractProvider | null = null;

export function getExtractProvider(): IExtractProvider {
  if (_cachedProvider) return _cachedProvider;

  if (config.extract.provider === 'CLAUDE') {
    if (!config.extract.anthropicApiKey) {
      throw new Error('EXTRACT_PROVIDER=CLAUDE requiere ANTHROPIC_API_KEY en .env');
    }
    _cachedProvider = new ClaudeProvider({
      apiKey: config.extract.anthropicApiKey,
      model: config.extract.anthropicModel,
    });
    return _cachedProvider;
  }
  _cachedProvider = new MockProvider();
  return _cachedProvider;
}

/** Solo para tests: limpia el cache para forzar re-construcción. */
export function _resetExtractProviderForTests(): void {
  _cachedProvider = null;
}

export { MockProvider } from './MockProvider';
export { ClaudeProvider } from './ClaudeProvider';
export type { IExtractProvider, ExtractResult, TipoExtract } from './types';
export { TIPOS_EXTRACT } from './types';
export { SCHEMAS_BY_TIPO, getSchemaForTipo, computeConfidence } from './schemas';
