/**
 * useExtractPDF — hook para extracción de datos desde PDF/imagen
 * vía POST /api/extract.
 *
 * Uso:
 *   const { extract, loading, error, reset } = useExtractPDF();
 *   const res = await extract(file, 'CSF');
 *   if (res) {
 *     // res.data: shape definida por el backend según el tipo
 *     // res.confidence: 0..1
 *     // res.warning?: string (presente si MOCK o confianza baja)
 *   }
 *
 * Manejo de errores:
 *   - Si el endpoint devuelve {error:{code,message}}, `error` queda
 *     poblado con el mensaje legible y la función devuelve `null`.
 *   - Network errors (sin response) → "No se pudo conectar".
 *
 * NO usa react-query: la extracción es one-shot a demanda y el caller
 * decide qué hacer con la data (típicamente popular un form). Cachear
 * por hash de archivo no aporta valor en este flujo.
 */
import { useCallback, useState } from 'react';
import api from '@/lib/api';

export type TipoExtract =
  | 'CSF'
  | 'INE'
  | 'COMPROBANTE_DOMICILIO'
  | 'FACTURA_BIEN'
  | 'ACTA_CONSTITUTIVA'
  | 'SOLICITUD';

export interface ExtractResponse {
  ok: true;
  provider: 'MOCK' | 'CLAUDE';
  confidence: number;
  data: Record<string, unknown>;
  warning?: string;
}

interface UseExtractPDFReturn {
  extract: (file: File, tipo: TipoExtract) => Promise<ExtractResponse | null>;
  loading: boolean;
  error: string | null;
  /** Última respuesta exitosa (útil para mostrar warning persistente). */
  lastResult: ExtractResponse | null;
  reset: () => void;
}

interface ApiErrorShape {
  error?: { code?: string; message?: string };
}

export function useExtractPDF(): UseExtractPDFReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExtractResponse | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setLastResult(null);
    setLoading(false);
  }, []);

  const extract = useCallback(
    async (file: File, tipo: TipoExtract): Promise<ExtractResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('tipo', tipo);
        const res = await api.post<ExtractResponse>('/extract', fd, {
          // Importante: dejar que axios infiera el boundary del multipart.
          // Si forzáramos 'application/json' o 'multipart/form-data' sin
          // boundary, multer no podría parsearlo.
          headers: { 'Content-Type': 'multipart/form-data' },
          // Subidas de PDFs grandes pueden tardar — el backend tiene
          // su propio timeout via Anthropic SDK, no aquí.
          timeout: 120_000,
        });
        setLastResult(res.data);
        return res.data;
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: { data?: ApiErrorShape; status?: number };
          message?: string;
        };
        const apiMsg = axiosErr.response?.data?.error?.message;
        const status = axiosErr.response?.status;
        let msg: string;
        if (apiMsg) {
          msg = apiMsg;
        } else if (status === 503) {
          msg = 'El servicio de extracción no está disponible. Contacta a soporte.';
        } else if (status === 502) {
          msg = 'El proveedor de extracción falló. Reintenta o captura manualmente.';
        } else if (axiosErr.message) {
          msg = axiosErr.message;
        } else {
          msg = 'No se pudo conectar con el servicio de extracción.';
        }
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { extract, loading, error, lastResult, reset };
}
