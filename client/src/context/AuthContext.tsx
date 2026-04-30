import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '@/lib/api';
import { loadCatalog } from '@/lib/catalog';
import { loadGpsProveedores } from '@/lib/cotizacion/gpsPricing';

interface User {
  id: string;
  email: string;
  nombre: string;
  apellidos: string;
  rol: string;
  mfaEnabled?: boolean;
  mustChangePassword?: boolean;
}

interface LoginResult {
  ok: boolean;
  mfaRequired?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, mfaToken?: string) => Promise<LoginResult>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data);
          // Sesión rehidratada (refresh con token válido) — ahora sí podemos
          // cargar el catálogo, que requiere auth. Fire-and-forget.
          void loadCatalog();
          void loadGpsProveedores();
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, mfaToken?: string): Promise<LoginResult> => {
    const body: { email: string; password: string; mfaToken?: string } = { email, password };
    if (mfaToken) body.mfaToken = mfaToken;
    const res = await api.post('/auth/login', body);

    // El backend (S5) responde 200 con { mfaRequired: true } cuando el
    // user tiene MFA habilitado y el request no incluyó token TOTP.
    // En ese caso NO guardamos token ni hidratamos sesión — devolvemos
    // la señal a Login.tsx para que pida el código TOTP y reintente.
    if (res.data.mfaRequired) {
      return { ok: false, mfaRequired: true };
    }

    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    // Hidrata el catálogo apenas se autentica. Antes lo hacía App.tsx
    // al boot, pero sin token la fetch da 401 y el cache se queda en
    // defaults — refrescamos aquí para tener los valores de BD.
    void loadCatalog();
    return { ok: true };
  };

  const refreshUser = async () => {
    const res = await api.get('/auth/me');
    setUser(res.data);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
