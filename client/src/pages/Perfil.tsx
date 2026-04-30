/**
 * /perfil — Pantalla del usuario autenticado.
 *
 * Permite (a) cambiar su contraseña, (b) habilitar/deshabilitar 2FA con TOTP,
 * (c) cerrar todas las sesiones (logout-all). Todo opt-in: ningún usuario es
 * forzado a activar MFA hoy. Si Inyecta decide hacerlo obligatorio en el
 * futuro, basta agregar un guard en login para los roles afectados.
 *
 * Endpoints consumidos (todos ya existentes en server, ver bloque S1/S4/S5):
 *   POST /api/auth/change-password       (S1)
 *   POST /api/auth/logout                (S4)
 *   POST /api/auth/logout-all            (S4)
 *   POST /api/auth/mfa/setup             (S5)
 *   POST /api/auth/mfa/verify-setup      (S5)
 *   POST /api/auth/mfa/disable           (S5)
 *   GET  /api/auth/mfa/status            (S5)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Copy,
  UserRound,
  Eye,
  EyeOff,
} from 'lucide-react';

type Section = 'main' | 'password' | 'mfa-setup' | 'mfa-disable';

function extractError(err: any, fallback = 'Ocurrió un error.'): string {
  return (
    err?.response?.data?.error?.message ??
    err?.response?.data?.error ??
    err?.message ??
    fallback
  );
}

export default function Perfil() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('main');

  if (!user) {
    return (
      <div className="p-6 text-sm text-gray-500">Cargando perfil...</div>
    );
  }

  const fullName = `${user.nombre} ${user.apellidos}`.trim();

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500">
          Configura tu cuenta y la seguridad de tus accesos.
        </p>
      </header>

      {/* Tarjeta de identidad */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-inyecta-700 text-white flex items-center justify-center">
          <UserRound size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">{fullName || user.email}</div>
          <div className="text-xs text-gray-500 truncate">{user.email}</div>
          <div className="text-xs mt-1">
            <span className="inline-block px-2 py-0.5 bg-inyecta-50 text-inyecta-800 rounded font-medium">
              {user.rol}
            </span>
          </div>
        </div>
      </section>

      {section === 'main' && (
        <MainPanel
          mfaEnabled={Boolean(user.mfaEnabled)}
          mustChangePassword={Boolean(user.mustChangePassword)}
          onChangePassword={() => setSection('password')}
          onSetupMfa={() => setSection('mfa-setup')}
          onDisableMfa={() => setSection('mfa-disable')}
          onLogoutAll={async () => {
            if (!confirm('Cerrar sesión en todos los dispositivos. ¿Continuar?')) return;
            try {
              await api.post('/auth/logout-all');
              alert('Todas las sesiones fueron cerradas. Iniciaremos sesión nuevamente.');
              logout();
              navigate('/login');
            } catch (err) {
              alert(extractError(err, 'No se pudieron cerrar las sesiones.'));
            }
          }}
        />
      )}

      {section === 'password' && (
        <PasswordPanel
          forced={Boolean(user.mustChangePassword)}
          onCancel={() => setSection('main')}
          onSuccess={async () => {
            await refreshUser();
            setSection('main');
            alert('Tu contraseña fue actualizada.');
          }}
        />
      )}

      {section === 'mfa-setup' && (
        <MfaSetupPanel
          onCancel={() => setSection('main')}
          onSuccess={async () => {
            await refreshUser();
            setSection('main');
          }}
        />
      )}

      {section === 'mfa-disable' && (
        <MfaDisablePanel
          onCancel={() => setSection('main')}
          onSuccess={async () => {
            await refreshUser();
            setSection('main');
            alert('La verificación en dos pasos fue desactivada.');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel principal
// ─────────────────────────────────────────────────────────────────────────────

function MainPanel({
  mfaEnabled,
  mustChangePassword,
  onChangePassword,
  onSetupMfa,
  onDisableMfa,
  onLogoutAll,
}: {
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  onChangePassword: () => void;
  onSetupMfa: () => void;
  onDisableMfa: () => void;
  onLogoutAll: () => void;
}) {
  return (
    <div className="space-y-4">
      {mustChangePassword && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 flex items-start gap-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            Tu administrador te asignó una contraseña temporal. Por seguridad,
            cámbiala antes de continuar usando el sistema.
          </div>
        </div>
      )}

      {/* Cambiar contraseña */}
      <Card
        icon={<KeyRound size={20} />}
        title="Contraseña"
        description="Cámbiala periódicamente. Mínimo 10 caracteres con mayúsculas, minúsculas, números y un símbolo."
        action={
          <button
            onClick={onChangePassword}
            className="px-3 py-1.5 bg-inyecta-700 hover:bg-inyecta-800 text-white text-xs rounded-lg font-medium transition-colors"
          >
            Cambiar contraseña
          </button>
        }
      />

      {/* MFA */}
      <Card
        icon={mfaEnabled ? <ShieldCheck size={20} className="text-emerald-600" /> : <ShieldOff size={20} className="text-gray-400" />}
        title={mfaEnabled ? 'Verificación en dos pasos: activa' : 'Verificación en dos pasos: inactiva'}
        description={
          mfaEnabled
            ? 'Cada vez que inicias sesión te pedimos un código de 6 dígitos de tu app autenticadora.'
            : 'Es opcional pero muy recomendable. Te protege incluso si alguien adivina tu contraseña.'
        }
        action={
          mfaEnabled ? (
            <button
              onClick={onDisableMfa}
              className="px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-700 text-xs rounded-lg font-medium transition-colors"
            >
              Desactivar
            </button>
          ) : (
            <button
              onClick={onSetupMfa}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-medium transition-colors"
            >
              Activar
            </button>
          )
        }
      />

      {/* Cerrar todas las sesiones */}
      <Card
        icon={<LogOut size={20} className="text-orange-500" />}
        title="Cerrar todas las sesiones"
        description="Si crees que alguien más entró a tu cuenta, ciérrala en todos los dispositivos en los que esté abierta."
        action={
          <button
            onClick={onLogoutAll}
            className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium transition-colors"
          >
            Cerrar todo
          </button>
        }
      />
    </div>
  );
}

function Card({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-gray-900">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cambio de contraseña
// ─────────────────────────────────────────────────────────────────────────────

function PasswordPanel({
  forced,
  onCancel,
  onSuccess,
}: {
  forced: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState('');
  const [violations, setViolations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setViolations([]);
    if (next !== confirm) {
      setError('La nueva contraseña y la confirmación no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      onSuccess();
    } catch (err: any) {
      const data = err?.response?.data?.error;
      if (data?.code === 'WEAK_PASSWORD' && Array.isArray(data?.details?.violations)) {
        setViolations(data.details.violations);
        setError('La contraseña no cumple los requisitos.');
      } else if (data?.code === 'PASSWORD_REUSE') {
        setError('No puedes reusar una contraseña reciente.');
      } else {
        setError(extractError(err, 'No se pudo cambiar la contraseña.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {forced ? 'Cambia tu contraseña temporal' : 'Cambiar contraseña'}
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {error}
          {violations.length > 0 && (
            <ul className="list-disc ml-5 mt-1">
              {violations.map((v) => (
                <li key={v}>{translateViolation(v)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <PasswordInput
        label="Contraseña actual"
        value={current}
        onChange={setCurrent}
        show={showCurrent}
        toggleShow={() => setShowCurrent((s) => !s)}
        autoFocus
      />

      <PasswordInput
        label="Nueva contraseña"
        value={next}
        onChange={setNext}
        show={showNext}
        toggleShow={() => setShowNext((s) => !s)}
        hint="Mínimo 10 caracteres con mayúsculas, minúsculas, números y un símbolo."
      />

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Confirmar nueva contraseña
        </label>
        <input
          type={showNext ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white text-xs rounded-lg font-medium"
        >
          {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
        </button>
      </div>
    </form>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  show,
  toggleShow,
  hint,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggleShow: () => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoFocus={autoFocus}
          className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
        />
        <button
          type="button"
          onClick={toggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function translateViolation(code: string): string {
  switch (code) {
    case 'TOO_SHORT': return 'Demasiado corta (mínimo 10 caracteres).';
    case 'TOO_LONG': return 'Demasiado larga (máximo 120 caracteres).';
    case 'MISSING_UPPER': return 'Necesita al menos una mayúscula.';
    case 'MISSING_LOWER': return 'Necesita al menos una minúscula.';
    case 'MISSING_DIGIT': return 'Necesita al menos un número.';
    case 'MISSING_SYMBOL': return 'Necesita al menos un símbolo (! ? # $ etc.).';
    case 'TRIVIAL_PATTERN': return 'Contiene un patrón trivial (qwerty, 12345, password, inyecta...).';
    case 'CONTAINS_PERSONAL_DATA': return 'No debe incluir tu nombre, apellidos o email.';
    case 'WHITESPACE_NOT_ALLOWED': return 'No debe contener espacios.';
    default: return code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MFA Setup
// ─────────────────────────────────────────────────────────────────────────────

interface MfaSetupResponse {
  secret: string;
  qrDataUrl: string;
  otpauthUri: string;
}

function MfaSetupPanel({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<'qr' | 'verify' | 'backup'>('qr');
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Llama /mfa/setup la primera vez que entra el panel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .post('/auth/mfa/setup')
      .then((res) => {
        if (cancelled) return;
        setSetup(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractError(err, 'No se pudo iniciar el enrolamiento.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/mfa/verify-setup', { token });
      setBackupCodes(res.data.backupCodes ?? []);
      setStep('backup');
    } catch (err) {
      setError(extractError(err, 'Código incorrecto. Inténtalo de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  if (loading && !setup) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500">
        Generando código QR...
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {error || 'No se pudo iniciar el enrolamiento.'}
        </div>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium"
        >
          Volver
        </button>
      </div>
    );
  }

  if (step === 'backup') {
    return (
      <BackupCodesPanel
        codes={backupCodes}
        onDone={onSuccess}
      />
    );
  }

  return (
    <form onSubmit={verify} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Activar verificación en dos pasos</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      <ol className="text-sm text-gray-700 list-decimal ml-5 space-y-2">
        <li>
          Instala una app autenticadora en tu teléfono (Google Authenticator,
          1Password, Microsoft Authenticator, Authy).
        </li>
        <li>
          Escanea el código QR de abajo. Si no puedes escanearlo, captura
          manualmente la clave secreta.
        </li>
        <li>Ingresa el código de 6 dígitos que aparece en la app.</li>
      </ol>

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <img
          src={setup.qrDataUrl}
          alt="Código QR de MFA"
          className="w-44 h-44 border border-gray-200 rounded-lg bg-white"
        />
        <div className="flex-1 min-w-0 w-full">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Clave secreta (manual)
          </label>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 px-2 py-1.5 bg-gray-100 border border-gray-200 rounded text-xs break-all">
              {setup.secret}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(setup.secret)}
              title="Copiar"
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
            >
              <Copy size={14} />
            </button>
          </div>

          <label className="block text-xs font-medium text-gray-700 mb-1">
            Código de 6 dígitos
          </label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none tracking-widest text-center font-mono"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || token.length !== 6}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs rounded-lg font-medium"
        >
          {loading ? 'Verificando...' : 'Verificar y activar'}
        </button>
      </div>
    </form>
  );
}

function BackupCodesPanel({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [confirmed, setConfirmed] = useState(false);

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    alert('Códigos copiados al portapapeles.');
  };

  const downloadTxt = () => {
    const text = [
      'Códigos de respaldo — Inyecta Arrendamiento',
      `Generados: ${new Date().toLocaleString('es-MX')}`,
      '',
      'Cada código se puede usar UNA SOLA VEZ.',
      'Guárdalos en un lugar seguro (1Password, papel en caja fuerte).',
      '',
      ...codes,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inyecta-mfa-backup-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={22} className="text-emerald-600" />
        <h2 className="text-lg font-semibold text-gray-900">¡Activado correctamente!</h2>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          Estos son tus códigos de respaldo. <strong>Aparecen una sola vez.</strong>
          Guárdalos en un lugar seguro. Si pierdes tu teléfono, los necesitarás
          para entrar al sistema.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <div key={c} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-center tracking-wider">
            {c}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={copyAll}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium flex items-center gap-1.5"
        >
          <Copy size={13} /> Copiar todos
        </button>
        <button
          onClick={downloadTxt}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium"
        >
          Descargar como .txt
        </button>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 pt-2 border-t border-gray-100">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>Ya guardé mis códigos de respaldo en un lugar seguro.</span>
      </label>

      <div className="flex justify-end">
        <button
          disabled={!confirmed}
          onClick={onDone}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm rounded-lg font-medium"
        >
          Listo
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MFA Disable
// ─────────────────────────────────────────────────────────────────────────────

function MfaDisablePanel({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/mfa/disable', { token });
      onSuccess();
    } catch (err) {
      setError(extractError(err, 'No se pudo desactivar.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Desactivar verificación en dos pasos</h2>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          Tu cuenta quedará protegida sólo con contraseña. Esto reduce tu
          seguridad. Para confirmar, ingresa un código actual de tu app
          autenticadora o uno de tus códigos de respaldo.
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          autoFocus
          autoComplete="one-time-code"
          placeholder="123456 ó ABCD-1234"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none tracking-widest text-center font-mono"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs rounded-lg font-medium"
        >
          {loading ? 'Desactivando...' : 'Desactivar'}
        </button>
      </div>
    </form>
  );
}
