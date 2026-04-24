/**
 * ExtractPDFButton — botón para extraer datos de un PDF/imagen
 * usando el endpoint POST /api/extract (Claude Vision o MOCK).
 *
 * Pensado para colgarse al lado de un campo o sobre un grupo de
 * campos en un wizard. El caller decide qué hacer con los datos
 * extraídos (típicamente: setValue en react-hook-form).
 *
 * Props:
 *   - tipo:       'CSF' | 'INE' | 'COMPROBANTE_DOMICILIO' |
 *                 'FACTURA_BIEN' | 'ACTA_CONSTITUTIVA'
 *   - label:      texto del botón (default según tipo)
 *   - onExtracted: callback con { data, confidence, provider, warning }
 *                  cuando la extracción tiene éxito.
 *
 * El componente NO inserta los datos automáticamente — se queda
 * neutro y deja que el caller mapee los campos. Esto evita acoples
 * frágiles cuando el shape del form difiere del shape del extract.
 *
 * UX:
 *   - input file oculto, se dispara al click del botón.
 *   - Loading: spinner + "Extrayendo...".
 *   - Éxito : mensaje verde "Datos cargados". Si hay warning (MOCK
 *             o confianza<0.5), se muestra con borde ámbar.
 *   - Error : mensaje rojo con el motivo. No se cierra solo —
 *             el usuario puede reintentar.
 */
import { useRef, useState } from 'react';
import { FileSearch, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useExtractPDF, type TipoExtract, type ExtractResponse } from '@/hooks/useExtractPDF';

const DEFAULT_LABELS: Record<TipoExtract, string> = {
  CSF: 'Extraer datos de CSF',
  INE: 'Extraer datos de INE',
  COMPROBANTE_DOMICILIO: 'Extraer comprobante de domicilio',
  FACTURA_BIEN: 'Extraer datos de factura',
  ACTA_CONSTITUTIVA: 'Extraer datos del acta constitutiva',
  SOLICITUD: 'Extraer datos de la solicitud',
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

interface Props {
  tipo: TipoExtract;
  onExtracted: (result: ExtractResponse) => void;
  label?: string;
  /** Tono del botón. 'primary' usa la marca, 'subtle' es secundario. */
  variant?: 'primary' | 'subtle';
  className?: string;
  disabled?: boolean;
}

export function ExtractPDFButton({
  tipo,
  onExtracted,
  label,
  variant = 'subtle',
  className = '',
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { extract, loading, error, lastResult, reset } = useExtractPDF();
  const [success, setSuccess] = useState<ExtractResponse | null>(null);

  const handleClick = () => {
    if (loading || disabled) return;
    setSuccess(null);
    reset();
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpia el value para que seleccionar el mismo archivo dos veces
    // dispare un nuevo onChange.
    e.target.value = '';
    if (!file) return;
    const res = await extract(file, tipo);
    if (res) {
      setSuccess(res);
      onExtracted(res);
    }
  };

  const buttonClass =
    variant === 'primary'
      ? 'bg-inyecta-600 hover:bg-inyecta-700 text-white'
      : 'bg-white hover:bg-gray-50 text-inyecta-700 border border-inyecta-200';

  const display = success ?? lastResult;
  const warningText = display?.warning;
  const showWarning = !!warningText;

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonClass}`}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Extrayendo...
          </>
        ) : (
          <>
            <FileSearch size={16} />
            {label ?? DEFAULT_LABELS[tipo]}
          </>
        )}
      </button>

      {success && !showWarning && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            Datos cargados (confianza:{' '}
            {(success.confidence * 100).toFixed(0)}%). Verifica antes de continuar.
          </div>
        </div>
      )}

      {showWarning && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>{warningText}</div>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <XCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      <p className="mt-1 text-xs text-gray-500">
        Formatos: PDF, JPG, PNG, WEBP. Máx. 10 MB.
      </p>
    </div>
  );
}
