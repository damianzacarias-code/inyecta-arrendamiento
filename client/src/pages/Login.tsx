import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useBranding } from '@/lib/branding';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const branding = useBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password, mfaRequired ? mfaToken : undefined);
      if (result.mfaRequired) {
        setMfaRequired(true);
        setError('');
        return;
      }
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        ?? err.response?.data?.error
        ?? 'Error al iniciar sesion';
      setError(typeof msg === 'string' ? msg : 'Error al iniciar sesion');
    } finally {
      setLoading(false);
    }
  };

  const cancelMfa = () => {
    setMfaRequired(false);
    setMfaToken('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-inyecta-900 via-inyecta-800 to-inyecta-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">IN</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Inyecta</h1>
          <p className="text-inyecta-300 text-sm mt-1">Sistema de Arrendamiento</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {mfaRequired ? 'Verificación en dos pasos' : 'Iniciar Sesion'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {!mfaRequired && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Correo electronico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="usuario@inyecta.com"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Contrasena
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {mfaRequired && (
              <div>
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-start gap-2">
                  <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
                  <div>
                    Tu cuenta tiene activada la verificación en dos pasos.
                    Abre tu app autenticadora y captura el código de 6 dígitos,
                    o utiliza un código de respaldo (formato XXXX-XXXX).
                  </div>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Código
                </label>
                <input
                  type="text"
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                  required
                  autoFocus
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder="123456 ó ABCD-1234"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none transition-colors tracking-widest text-center font-mono"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  {mfaRequired ? <ShieldCheck size={16} /> : <LogIn size={16} />}
                  {mfaRequired ? 'Verificar' : 'Entrar'}
                </>
              )}
            </button>

            {mfaRequired && (
              <button
                type="button"
                onClick={cancelMfa}
                className="w-full text-xs text-gray-500 hover:text-gray-700"
              >
                Volver al inicio de sesión
              </button>
            )}
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            {branding.empresa.razonSocial}
          </p>
        </div>
      </div>
    </div>
  );
}
