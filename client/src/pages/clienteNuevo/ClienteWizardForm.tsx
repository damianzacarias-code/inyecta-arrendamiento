// ClienteWizardForm — el formulario de alta/edición de arrendatario,
// extraído de la página ClienteNuevo para poder reutilizarlo TANTO en
// la página /clientes/nuevo COMO embebido en un modal dentro del wizard
// de operación (Fase 1 del rediseño: "el cliente se crea dentro de la
// operación, sin salir").
//
// La única diferencia respecto al comportamiento anterior: al guardar
// con éxito ya NO navega — invoca `onSaved(cliente)` y deja que el
// consumidor decida (la página navega; el modal cierra y auto-selecciona).
//
// Wizard de 4 pasos con react-hook-form + Zod. El schema Zod espejado
// desde server/src/schemas/client.ts es la única fuente de validación.
//   1. Identidad (tipo + datos del solicitante)
//   2. Domicilio fiscal + operación
//   3. Representante legal (obligatorio PM, opcional PFAE)
//   4. Accionistas (solo PM)

import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import {
  createClientSchema,
  type CreateClientInput,
} from '@/schemas/client';
import { WIZARD_STEPS } from './constants';
import {
  WizardShell,
  type WizardStep,
} from '@/components/wizard/WizardShell';
import { Step1Identidad } from './Step1Identidad';
import { Step2Domicilio } from './Step2Domicilio';
import { Step3RepresentanteLegal } from './Step3RepresentanteLegal';
import { Step4Accionistas } from './Step4Accionistas';

/** Cliente devuelto por el API tras crear/editar (campos que consume el
 *  selector del wizard de operación). El resto del objeto pasa intacto. */
export type SavedClient = {
  id: string;
  tipo?: 'PFAE' | 'PM';
  nombre?: string | null;
  apellidoPaterno?: string | null;
  razonSocial?: string | null;
  rfc?: string | null;
  [k: string]: unknown;
};

interface Props {
  /** Si viene, el wizard entra en modo edición (carga y hace PUT). */
  editId?: string;
  /** Llamado tras guardar con éxito (create o edit) con el cliente del API. */
  onSaved: (cliente: SavedClient) => void;
  /** Para el botón "Volver" del estado de error de carga (modo edición). */
  onCancel: () => void;
}

// ── Paths que se validan individualmente en cada paso ───────────
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

/** Primer paso VISIBLE que contiene un error (al fallar el submit final). */
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
  void _mismoDomicilioOp;
  void _declararRL;
  if (rest.tipo === 'PFAE' && Array.isArray(rest.socios)) {
    return { ...rest, socios: undefined };
  }
  return rest;
}

/** Mapea GET /api/clients/:id al shape que espera el wizard (modo edición). */
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
    fechaConstitucion: isoDate(c.fechaConstitucion),
    fechaInscripcionRPC: isoDate(c.fechaInscripcionRPC),
    capitalSocial: num(c.capitalSocial),
    representanteLegal: rl
      ? {
          ...rl,
          fechaNacimiento: isoDate(rl.fechaNacimiento),
          fechaInscripcionPoderes: isoDate(rl.fechaInscripcionPoderes),
        }
      : undefined,
    socios: socios.map((s) => ({
      ...s,
      porcentaje: num(s.porcentaje) ?? 0,
      fechaNacimiento: isoDate(s.fechaNacimiento),
      fechaInscripcionEscrituraConst: isoDate(s.fechaInscripcionEscrituraConst),
    })) as WizardFormShape['socios'],
    _mismoDomicilioOp: !c.calleOp || c.calleOp === c.calle,
    _declararRL: !!rl,
  } as Partial<WizardFormShape>;
}

export function ClienteWizardForm({ editId, onSaved, onCancel }: Props) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const tipo = methods.watch('tipo');

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

  if (currentIndex > visibleSteps.length - 1) {
    setCurrentIndex(visibleSteps.length - 1);
  }

  const currentStep = visibleSteps[currentIndex];

  const handleNext = async () => {
    const paths = STEP_PATHS[currentStep.key] ?? [];
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
          const res = await api.put(`/clients/${editId}`, payload);
          onSaved({ id: editId, ...(res.data as Record<string, unknown>) });
        } else {
          const res = await api.post('/clients', payload);
          onSaved(res.data as SavedClient);
        }
      } catch (err: unknown) {
        const msg = extractApiError(err);
        setSubmitError(msg);
        setSubmitting(false);
      }
    },
    (errors) => {
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

  if (isEditing && loadingClient) {
    return (
      <div className="py-20 flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-inyecta-600" size={28} />
        <p className="text-sm text-gray-500">Cargando datos del arrendatario...</p>
      </div>
    );
  }
  if (isEditing && loadError) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-600 font-medium mb-2">{loadError}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-inyecta-600 hover:underline text-sm"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
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
