// Nuevo Arrendatario — wizard de 4 pasos con react-hook-form + Zod.
//
// Estado global del formulario vive aquí; cada paso consume los campos
// vía useFormContext (dentro del FormProvider). El schema Zod
// espejado desde `server/src/schemas/client.ts` es la única fuente
// de validación.
//
// Flujo:
//   1. Identidad (tipo + datos del solicitante)
//   2. Domicilio fiscal + operación
//   3. Representante legal (obligatorio PM, opcional PFAE)
//   4. Accionistas (solo PM)
//
// Navegación:
//   - "Siguiente" valida SOLO los paths del paso actual con trigger();
//     si pasan, avanza. Los errores de otros pasos (surgen de refines
//     a nivel raíz) no bloquean la navegación hasta el envío final.
//   - "Registrar arrendatario" dispara handleSubmit con el schema
//     completo. Si falla, saltamos al primer paso que contenga error.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import {
  createClientSchema,
  type CreateClientInput,
} from '@/schemas/client';
import { WIZARD_STEPS } from './clienteNuevo/constants';
import {
  WizardShell,
  type WizardStep,
} from '@/components/wizard/WizardShell';
import { Step1Identidad } from './clienteNuevo/Step1Identidad';
import { Step2Domicilio } from './clienteNuevo/Step2Domicilio';
import { Step3RepresentanteLegal } from './clienteNuevo/Step3RepresentanteLegal';
import { Step4Accionistas } from './clienteNuevo/Step4Accionistas';

// ── Paths que se validan individualmente en cada paso ───────────
//
// Nota: no enumeramos TODOS los campos (muchos son opcionales). Solo
// los que el schema marca como requeridos por refinamiento de tipo.
// El superRefine del schema completo se corre al enviar.
const STEP_PATHS: Record<string, string[]> = {
  identidad: [
    'tipo',
    'nombre',
    'apellidoPaterno',
    'curp',
    'razonSocial',
    'fechaConstitucion',
    'capitalSocial',
    'folioMercantil',
    'rfc',
    'email',
    'telefono',
  ],
  domicilio: ['calle', 'numExterior', 'colonia', 'municipio', 'estado', 'cp'],
  representante: [
    'representanteLegal.nombre',
    'representanteLegal.apellidoPaterno',
    'representanteLegal.fechaInscripcionPoderes',
    'representanteLegal.folioInscripcionPoderes',
    'representanteLegal.regimenMatrimonial',
    'representanteLegal.nombreConyuge',
  ],
  accionistas: ['socios'],
};

/**
 * Inspecciona los errores y devuelve el índice del primer paso VISIBLE
 * que los contiene. Usado cuando el submit final falla para saltar al
 * lugar correcto.
 */
function firstStepWithError(
  errors: Record<string, unknown>,
  visible: WizardStep[],
): number {
  const errorPaths = Object.keys(errors);
  for (let i = 0; i < visible.length; i++) {
    const step = visible[i];
    const paths = STEP_PATHS[step.key] ?? [];
    const prefixes: string[] = [];
    if (step.key === 'representante') prefixes.push('representanteLegal');
    if (step.key === 'accionistas') prefixes.push('socios');
    const hit = errorPaths.some(
      (p) =>
        paths.some((q) => p === q || p.startsWith(q + '.')) ||
        prefixes.some((pre) => p === pre || p.startsWith(pre + '.')),
    );
    if (hit) return i;
  }
  return 0;
}

// Form shape incluye flags de UI (prefijo `_`) que NO van al POST.
type WizardFormShape = CreateClientInput & {
  _mismoDomicilioOp?: boolean;
  _declararRL?: boolean;
};

/** Quita los flags internos del payload antes de enviar al API. */
function stripInternal(data: WizardFormShape): CreateClientInput {
  const { _mismoDomicilioOp, _declararRL, ...rest } = data;
  // Referenciar los descartados para que TS no marque no-unused-vars.
  void _mismoDomicilioOp;
  void _declararRL;
  // En PFAE el array de socios NO aplica — el backend lo rechazaría.
  if (rest.tipo === 'PFAE' && Array.isArray(rest.socios)) {
    return { ...rest, socios: undefined };
  }
  return rest;
}

/**
 * Mapea la respuesta de GET /api/clients/:id al shape que espera el
 * wizard. La diferencia clave: el endpoint devuelve la relación 1:1
 * como `representanteLegalData`, pero el form/POST/PUT espera
 * `representanteLegal`. También convierte fechas ISO a "YYYY-MM-DD"
 * (lo que esperan los <input type="date">) y decimales a number.
 */
function clientToFormValues(c: Record<string, unknown>): Partial<WizardFormShape> {
  const isoDate = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : undefined;
  const num = (v: unknown): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const rl = c.representanteLegalData as Record<string, unknown> | null | undefined;
  const socios = (c.socios as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    ...c,
    // Fechas a yyyy-MM-dd
    fechaConstitucion: isoDate(c.fechaConstitucion),
    fechaInscripcionRPC: isoDate(c.fechaInscripcionRPC),
    // Decimal → number
    capitalSocial: num(c.capitalSocial),
    // Relación 1:1: aplanar a campo del form
    representanteLegal: rl
      ? {
          ...rl,
          fechaNacimiento: isoDate(rl.fechaNacimiento),
          fechaInscripcionPoderes: isoDate(rl.fechaInscripcionPoderes),
        }
      : undefined,
    // Socios: convertir porcentaje Decimal → number, fechas a yyyy-MM-dd
    socios: socios.map((s) => ({
      ...s,
      porcentaje: num(s.porcentaje) ?? 0,
      fechaNacimiento: isoDate(s.fechaNacimiento),
      fechaInscripcionEscrituraConst: isoDate(s.fechaInscripcionEscrituraConst),
    })) as WizardFormShape['socios'],
    // Flags internos del wizard: heurística — si calleOp coincide con
    // calle, el operador originalmente marcó "mismo domicilio".
    _mismoDomicilioOp:
      !c.calleOp || c.calleOp === c.calle,
    _declararRL: !!rl,
  } as Partial<WizardFormShape>;
}

export default function ClienteNuevo() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditing = !!editId;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClient, setLoadingClient] = useState(isEditing);
  const [loadError, setLoadError] = useState<string | null>(null);

  const methods = useForm<WizardFormShape>({
    resolver: zodResolver(createClientSchema) as never,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      tipo: 'PM',
      pais: 'México',
      socios: [],
      _mismoDomicilioOp: true,
      _declararRL: false,
    },
  });

  // En modo edición: cargar el cliente y rellenar el form con
  // methods.reset() — esto propaga correctamente a campos anidados y
  // useFieldArray (socios). Si la carga falla, mostramos error legible.
  useEffect(() => {
    if (!editId) return;
    setLoadingClient(true);
    setLoadError(null);
    api.get(`/clients/${editId}`)
      .then((res) => {
        const mapped = clientToFormValues(res.data as Record<string, unknown>);
        methods.reset(mapped as WizardFormShape);
      })
      .catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg = extractApiError(err);
        setLoadError(
          status === 404 ? 'Cliente no encontrado'
          : status === 401 || status === 403 ? 'No tienes permisos para editar este cliente'
          : `No se pudo cargar el cliente: ${msg}`,
        );
      })
      .finally(() => setLoadingClient(false));
    // methods es estable (useForm); editId puede cambiar al navegar
    // entre dos clientes distintos sin desmontar el componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  const tipo = methods.watch('tipo');

  // Paso de accionistas se oculta para PFAE.
  const steps: WizardStep[] = useMemo(
    () =>
      WIZARD_STEPS.map((s) => ({
        ...s,
        visible: s.key === 'accionistas' ? tipo === 'PM' : true,
      })),
    [tipo],
  );
  const visibleSteps = useMemo(
    () => steps.filter((s) => s.visible !== false),
    [steps],
  );

  // Si se cambia de PM → PFAE estando en el paso de accionistas,
  // retrocedemos al último visible.
  if (currentIndex > visibleSteps.length - 1) {
    setCurrentIndex(visibleSteps.length - 1);
  }

  const currentStep = visibleSteps[currentIndex];

  const handleNext = async () => {
    const paths = STEP_PATHS[currentStep.key] ?? [];
    // trigger sin args valida todo el form; con args valida solo esos paths.
    const ok =
      paths.length === 0
        ? true
        : await methods.trigger(paths as Parameters<typeof methods.trigger>[0]);
    if (ok) {
      setCurrentIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
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
        if (isEditing && editId) {
          // PUT acepta el mismo shape que POST. El server filtra
          // internamente: `tipo` no se actualiza post-creación, y
          // socios se reemplazan completos (strategy "replace").
          await api.put(`/clients/${editId}`, payload);
          navigate(`/clientes/${editId}`);
        } else {
          const res = await api.post('/clients', payload);
          navigate(`/clientes/${res.data.id}`);
        }
      } catch (err: unknown) {
        const msg = extractApiError(err);
        setSubmitError(msg);
        setSubmitting(false);
      }
    },
    (errors) => {
      // El submit falló por validación local: saltamos al primer paso con error.
      const target = firstStepWithError(
        errors as Record<string, unknown>,
        visibleSteps,
      );
      setCurrentIndex(target);
      setSubmitError(
        'Hay campos por corregir en la solicitud. Revisa los errores marcados en rojo.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  );

  const backHref = isEditing && editId ? `/clientes/${editId}` : '/clientes';
  const titulo = isEditing ? 'Editar Arrendatario' : 'Nuevo Arrendatario';
  const descripcion = isEditing
    ? 'Actualiza los datos del arrendatario (CNBV / KYC)'
    : 'Solicitud completa de arrendamiento (CNBV / KYC)';

  // Mientras cargamos el cliente en modo edición, no renderizamos el
  // wizard — sus pasos asumen que defaultValues ya están listos. Si la
  // carga falla, mostramos el error con opción de volver.
  if (isEditing && loadingClient) {
    return (
      <div className="max-w-4xl mx-auto py-20 flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-inyecta-600" size={28} />
        <p className="text-sm text-gray-500">Cargando datos del arrendatario...</p>
      </div>
    );
  }
  if (isEditing && loadError) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <p className="text-red-600 font-medium mb-2">{loadError}</p>
        <Link to={backHref} className="text-inyecta-600 hover:underline text-sm">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 max-w-4xl mx-auto">
        <Link to={backHref} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-gray-500 text-sm">{descripcion}</p>
        </div>
      </div>

      <FormProvider {...methods}>
        <WizardShell
          steps={steps}
          currentIndex={currentIndex}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={onSubmit}
          isSubmitting={submitting}
          formError={submitError ?? undefined}
          submitLabel={isEditing ? 'Guardar cambios' : undefined}
        >
          {currentStep.key === 'identidad' && <Step1Identidad />}
          {currentStep.key === 'domicilio' && <Step2Domicilio />}
          {currentStep.key === 'representante' && <Step3RepresentanteLegal />}
          {currentStep.key === 'accionistas' && <Step4Accionistas />}
        </WizardShell>
      </FormProvider>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

/** Extrae un mensaje legible del error de axios (zod issues, string o fallback). */
function extractApiError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'Error al guardar el cliente';
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
  return e.response?.data?.message ?? e.message ?? 'Error al guardar el cliente';
}
