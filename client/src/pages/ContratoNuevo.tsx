// Nueva Operación — wizard multi-paso con react-hook-form + Zod.
//
// Reemplaza la página legacy single-form por un flujo CNBV/KYC completo
// en 4 pasos. El schema compuesto (createContractWizardSchema) vive en
// operacionNuevo/wizardSchema.ts — es un mirror de lo que arma inline
// server/src/routes/contracts.ts#createContractSchema.
//
// Flujo:
//   1. Operación  — cliente + producto + nivel de riesgo + bien
//   2. Financiero — parámetros + resumen live + datos de solicitud
//   3. KYC        — proveedor + perfil transaccional + terceros + PEP
//   4. Avales     — obligados solidarios (hasta 3) sobre el cliente
//
// Navegación:
//   - "Siguiente" valida sólo los paths del paso actual con trigger();
//     el superRefine global se corre al enviar. Si el submit falla por
//     validación, saltamos al primer paso con error.
//   - Prefill desde ?clientId= y ?quotationId= (compat con la legacy).

import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, FileText } from 'lucide-react';
import api from '@/lib/api';
import {
  WizardShell,
  type WizardStep,
} from '@/components/wizard/WizardShell';
import {
  createContractWizardSchema,
  type CreateContractWizardInput,
} from './operacionNuevo/wizardSchema';
import { WIZARD_STEPS } from './operacionNuevo/constants';
import type { ClientOption } from './operacionNuevo/ClienteSelector';
import { Step1Operacion } from './operacionNuevo/Step1Operacion';
import { Step2Financiero } from './operacionNuevo/Step2Financiero';
import { Step3Kyc } from './operacionNuevo/Step3Kyc';
import { Step4Avales } from './operacionNuevo/Step4Avales';

// Paths validados por paso. Solo incluimos los que el schema marca
// como requeridos; el superRefine completo corre al submit final.
const STEP_PATHS: Record<string, string[]> = {
  operacion: ['clientId', 'producto', 'nivelRiesgo', 'bienDescripcion'],
  financiero: [
    'valorBien',
    'plazo',
    'tasaAnual',
    'montoFinanciar',
    'rentaMensual',
    'rentaMensualIVA',
  ],
  kyc: ['proveedor.nombre', 'declaracionesPEP', 'perfilTransaccional'],
  avales: ['obligadosSolidarios'],
};

/**
 * Devuelve el índice del primer paso VISIBLE cuyo subtree de errores
 * contiene alguna violación. Fallback: 0.
 */
function firstStepWithError(
  errors: Record<string, unknown>,
  visible: WizardStep[],
): number {
  const errorPaths = Object.keys(errors);
  for (let i = 0; i < visible.length; i++) {
    const step = visible[i];
    const paths = STEP_PATHS[step.key] ?? [];
    const hit = errorPaths.some((p) =>
      paths.some((q) => p === q || p.startsWith(q + '.') || p.startsWith(q)),
    );
    if (hit) return i;
  }
  return 0;
}

type WizardFormShape = CreateContractWizardInput & {
  // Flags internos que no deben llegar al backend
  _comisionAperturaPct?: number;
  _valorResidualPct?: number;
  _ningunoPep?: boolean;
};

/** Quita los flags `_internos` antes de POSTear. */
function stripInternal(data: WizardFormShape): CreateContractWizardInput {
  const {
    _comisionAperturaPct,
    _valorResidualPct,
    _ningunoPep,
    ...rest
  } = data;
  void _comisionAperturaPct;
  void _valorResidualPct;
  void _ningunoPep;
  return rest;
}

export default function ContratoNuevo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preClientId = searchParams.get('clientId');
  const preQuotationId = searchParams.get('quotationId');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cliente, setCliente] = useState<ClientOption | null>(null);
  const [prefillFolio, setPrefillFolio] = useState<string>('');

  const methods = useForm<WizardFormShape>({
    resolver: zodResolver(createContractWizardSchema) as never,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      producto: 'PURO',
      nivelRiesgo: 'B',  // Default Medio (política comercial estándar, 27-04-2026)
      plazo: 24,
      tasaAnual: 0.36,
      valorBien: 0,
      enganche: 0,
      depositoGarantia: 0,
      comisionApertura: 0,
      valorResidual: 0,
      gpsInstalacion: 3500,
      seguroAnual: 0,
      rentaInicial: 0,
      montoFinanciar: 0,
      rentaMensual: 0,
      rentaMensualIVA: 0,
      bienEstado: 'Nuevo',
      obligadosSolidarios: [],
      declaracionesPEP: [],
      _comisionAperturaPct: 0.05,
      _valorResidualPct: 0.01,
    },
  });

  const clientId = methods.watch('clientId');

  // ── Prefill: cliente pre-seleccionado via ?clientId= ─────────────
  useEffect(() => {
    if (!preClientId || cliente) return;
    api
      .get(`/clients/${preClientId}`)
      .then((res) => {
        setCliente(res.data);
        methods.setValue('clientId', res.data.id, {
          shouldDirty: true,
          shouldValidate: false,
        });
      })
      .catch((err) => {
        // Prefill best-effort: si el cliente no se carga, el wizard
        // sigue funcionando — el usuario puede buscarlo manualmente.
        // Loggeamos para que aparezca en el devtools en lugar de
        // fallar silenciosamente.
        console.warn('[ContratoNuevo] No se pudo precargar cliente', err);
      });
  }, [preClientId, cliente, methods]);

  // ── Prefill: datos desde una cotización existente ────────────────
  useEffect(() => {
    if (!preQuotationId) return;
    api
      .get(`/quotations/${preQuotationId}`)
      .then((res) => {
        const q = res.data;
        setPrefillFolio(q.folio || '');
        if (q.clientId && !preClientId) {
          api
            .get(`/clients/${q.clientId}`)
            .then((c) => {
              setCliente(c.data);
              methods.setValue('clientId', c.data.id, {
                shouldDirty: true,
                shouldValidate: false,
              });
            })
            .catch((err) => {
              // Mismo razonamiento que arriba: prefill opcional.
              console.warn('[ContratoNuevo] No se pudo precargar cliente desde cotización', err);
            });
        }
        const patch = methods.setValue;
        if (q.producto) patch('producto', q.producto);
        if (q.nivelRiesgo) patch('nivelRiesgo', q.nivelRiesgo);
        if (q.valorBien) patch('valorBien', Number(q.valorBien));
        if (q.plazo) patch('plazo', Number(q.plazo));
        if (q.tasaAnual) patch('tasaAnual', Number(q.tasaAnual));
        if (q.bienDescripcion) patch('bienDescripcion', q.bienDescripcion);
        if (q.bienMarca) patch('bienMarca', q.bienMarca);
        if (q.bienModelo) patch('bienModelo', q.bienModelo);
        if (q.bienAnio) patch('bienAnio', Number(q.bienAnio));
        if (q.bienNumSerie) patch('bienNumSerie', q.bienNumSerie);
        patch('bienEstado', q.bienNuevo === false ? 'Seminuevo' : 'Nuevo');
        if (q.comisionAperturaPct != null)
          patch('_comisionAperturaPct', Number(q.comisionAperturaPct));
        if (q.gpsInstalacion != null)
          patch('gpsInstalacion', Number(q.gpsInstalacion));
        if (q.seguroAnual != null) patch('seguroAnual', Number(q.seguroAnual));
        if (q.valorResidualPct != null)
          patch('_valorResidualPct', Number(q.valorResidualPct));
        if (q.rentaInicial != null) patch('rentaInicial', Number(q.rentaInicial));
        if (q.id) patch('quotationId', q.id);
      })
      .catch(() => setSubmitError('No se pudo cargar la cotización para prefill'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preQuotationId]);

  const steps: WizardStep[] = useMemo(() => WIZARD_STEPS.map((s) => ({ ...s })), []);
  const currentStep = steps[currentIndex];

  const handleNext = async () => {
    const paths = STEP_PATHS[currentStep.key] ?? [];
    const ok =
      paths.length === 0
        ? true
        : await methods.trigger(
            paths as Parameters<typeof methods.trigger>[0],
          );
    if (ok) {
      setCurrentIndex((i) => Math.min(i + 1, steps.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = methods.handleSubmit(
    async (values) => {
      setSubmitError(null);
      setSubmitting(true);
      try {
        const payload = stripInternal(values);
        const res = await api.post('/contracts', payload);
        navigate(`/contratos/${res.data.id}`);
      } catch (err: unknown) {
        setSubmitError(extractApiError(err));
        setSubmitting(false);
      }
    },
    (errors) => {
      const target = firstStepWithError(
        errors as Record<string, unknown>,
        steps,
      );
      setCurrentIndex(target);
      setSubmitError(
        'Hay campos por corregir en la solicitud. Revisa los errores marcados en rojo.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 max-w-4xl mx-auto">
        <Link to="/contratos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Operación</h1>
          <p className="text-gray-500 text-sm">
            Solicitud de arrendamiento (CNBV / KYC)
          </p>
        </div>
      </div>

      {prefillFolio && (
        <div className="bg-violet-50 border border-violet-200 text-violet-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2 max-w-4xl mx-auto">
          <FileText size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Datos prellenados</strong> desde la cotización{' '}
            <Link
              to={`/cotizaciones/${preQuotationId}`}
              className="font-mono font-medium underline"
            >
              {prefillFolio}
            </Link>
            . Al guardar, la cotización se marcará como CONVERTIDA.
          </div>
        </div>
      )}

      <FormProvider {...methods}>
        <WizardShell
          steps={steps}
          currentIndex={currentIndex}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={onSubmit}
          isSubmitting={submitting}
          submitLabel="Crear contrato"
          formError={submitError ?? undefined}
        >
          {currentStep.key === 'operacion' && (
            <Step1Operacion cliente={cliente} onClienteChange={setCliente} />
          )}
          {currentStep.key === 'financiero' && <Step2Financiero />}
          {currentStep.key === 'kyc' && <Step3Kyc />}
          {currentStep.key === 'avales' && (
            <Step4Avales clientId={clientId || null} />
          )}
        </WizardShell>
      </FormProvider>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function extractApiError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'Error al crear contrato';
  const e = err as {
    response?: { data?: { error?: unknown; message?: string } };
    message?: string;
  };
  const raw = e.response?.data?.error;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item: { path?: string[]; message?: string }) => {
        const path = Array.isArray(item?.path) ? item.path.join('.') : '';
        return path ? `${path}: ${item?.message ?? ''}` : item?.message ?? '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  if (raw && typeof raw === 'object') {
    const o = raw as { code?: string; message?: string };
    if (o.message) return o.message;
  }
  return e.response?.data?.message ?? e.message ?? 'Error al crear contrato';
}
