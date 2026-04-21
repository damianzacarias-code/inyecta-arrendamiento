// Form primitives reutilizables para el wizard de Nuevo Arrendatario
// y de Nueva Operación. Integran react-hook-form + errores de Zod.
//
// Todos los componentes aceptan `path` como string con notación de
// dot-path (ej: "representanteLegal.nombreConyuge", "socios.0.rfc")
// y se registran con `useFormContext()` — por eso deben renderizarse
// DENTRO de un <FormProvider>.

import { type ReactNode } from 'react';
import { useFormContext, get } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

/** Muestra el error Zod asociado a un path, si existe. */
function FieldError({ path }: { path: string }) {
  const {
    formState: { errors },
  } = useFormContext();
  const err = get(errors, path);
  if (!err) return null;
  const msg = typeof err.message === 'string' ? err.message : 'Campo inválido';
  return (
    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
      <AlertCircle size={12} /> {msg}
    </p>
  );
}

const baseInputClasses =
  'w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 transition-colors';

function borderClasses(hasError: boolean) {
  return hasError ? 'border-red-400' : 'border-gray-300';
}

// ── TextField ────────────────────────────────────────────────────

export function TextField({
  path,
  label,
  required,
  placeholder,
  type = 'text',
  uppercase,
  maxLength,
  help,
  monospace,
  className,
}: {
  path: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date';
  uppercase?: boolean;
  maxLength?: number;
  help?: string;
  monospace?: boolean;
  className?: string;
}) {
  const {
    register,
    formState: { errors },
    setValue,
  } = useFormContext();
  const err = get(errors, path);

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        className={clsx(
          baseInputClasses,
          borderClasses(!!err),
          monospace && 'font-mono',
        )}
        {...register(path, {
          // Cuando el input es number, convertimos "" → undefined y string → number
          setValueAs: (v) => {
            if (type === 'number') {
              if (v === '' || v == null) return undefined;
              const n = Number(v);
              return isNaN(n) ? v : n;
            }
            return v;
          },
        })}
        onChange={(e) => {
          let v = e.target.value;
          if (uppercase) v = v.toUpperCase();
          setValue(path, v, { shouldValidate: false, shouldDirty: true });
        }}
      />
      {help && !err && <p className="mt-1 text-xs text-gray-500">{help}</p>}
      <FieldError path={path} />
    </div>
  );
}

// ── SelectField ──────────────────────────────────────────────────

export function SelectField({
  path,
  label,
  required,
  options,
  placeholder = 'Seleccionar...',
  help,
  className,
}: {
  path: string;
  label: string;
  required?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
  className?: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const err = get(errors, path);
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        className={clsx(baseInputClasses, borderClasses(!!err), 'bg-white')}
        {...register(path, {
          setValueAs: (v) => (v === '' ? undefined : v),
        })}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {help && !err && <p className="mt-1 text-xs text-gray-500">{help}</p>}
      <FieldError path={path} />
    </div>
  );
}

// ── CheckboxField ────────────────────────────────────────────────

export function CheckboxField({
  path,
  label,
  help,
  className,
}: {
  path: string;
  label: string;
  help?: string;
  className?: string;
}) {
  const { register } = useFormContext();
  return (
    <label className={clsx('flex items-start gap-2 cursor-pointer', className)}>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-gray-300 text-inyecta-600 focus:ring-inyecta-500"
        {...register(path)}
      />
      <div>
        <div className="text-sm text-gray-800">{label}</div>
        {help && <div className="text-xs text-gray-500">{help}</div>}
      </div>
    </label>
  );
}

// ── RadioGroup (Sí / No / custom) ────────────────────────────────

export function RadioBoolField({
  path,
  label,
  required,
  help,
  className,
}: {
  path: string;
  label: string;
  required?: boolean;
  help?: string;
  className?: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const err = get(errors, path);
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            value="true"
            className="h-4 w-4 text-inyecta-600 focus:ring-inyecta-500"
            {...register(path, {
              setValueAs: (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
            })}
          />
          <span className="text-sm text-gray-800">Sí</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            value="false"
            className="h-4 w-4 text-inyecta-600 focus:ring-inyecta-500"
            {...register(path, {
              setValueAs: (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
            })}
          />
          <span className="text-sm text-gray-800">No</span>
        </label>
      </div>
      {help && !err && <p className="mt-1 text-xs text-gray-500">{help}</p>}
      <FieldError path={path} />
    </div>
  );
}

// ── TextArea ─────────────────────────────────────────────────────

export function TextAreaField({
  path,
  label,
  required,
  rows = 3,
  placeholder,
  className,
}: {
  path: string;
  label: string;
  required?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const err = get(errors, path);
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        rows={rows}
        placeholder={placeholder}
        className={clsx(baseInputClasses, borderClasses(!!err))}
        {...register(path)}
      />
      <FieldError path={path} />
    </div>
  );
}

// ── FormSection (card container) ────────────────────────────────

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl border border-gray-200 p-6',
        className,
      )}
    >
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
