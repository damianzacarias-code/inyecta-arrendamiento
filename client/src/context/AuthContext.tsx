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
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    // Hidrata el catálogo apenas se autentica. Antes lo hacía App.tsx
    // al boot, pero sin token la fetch da 401 y el cache se queda en
    // defaults — refrescamos aquí para tener los valores de BD.
    void loadCatalog();
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
