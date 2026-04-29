import axios from 'axios';

/**
 * BaseURL del backend.
 *
 * En desarrollo: el proxy de Vite (vite.config.ts) reenvía /api a
 * http://localhost:3001 → mantenemos el prefijo relativo.
 *
 * En producción: el cliente vive en Vercel y el backend en Render
 * (dominios distintos). Definimos VITE_API_URL en Vercel (ej.
 * https://inyecta-api.onrender.com) y aquí lo usamos como baseURL.
 * El backend tiene CORS_ALLOWED_ORIGINS para autorizar el dominio de
 * Vercel.
 *
 * Como import.meta.env.VITE_API_URL es texto inyectado en build time,
 * cualquier cambio requiere rebuild del frontend (un re-deploy de
 * Vercel toma ~30 seg).
 */
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api`
  : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Rutas del frontend que NO deben recibir redirección automática a /login
 * cuando el backend responde 401. Si ya estás en una de estas, hacer
 * `window.location.href = '/login'` provoca un full-page reload, que
 * vuelve a montar el árbol, que vuelve a disparar el fetch, que vuelve a
 * dar 401 → loop infinito.
 *
 * Las rutas son las que el ProtectedRoute deja entrar sin auth (ver App.tsx).
 */
const PUBLIC_ROUTES = ['/login'];
function isOnPublicRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  if (PUBLIC_ROUTES.includes(p)) return true;
  if (p.startsWith('/portal/')) return true;     // portal del arrendatario por token
  return false;
}

/**
 * Endpoints del backend que NO deben dispararnos a /login si responden 401.
 * El handler del componente que los llamó muestra el error inline.
 */
function isLoginEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return url.endsWith('/auth/login') || url.endsWith('/auth/register');
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      // Limpieza siempre — un token expirado/invalido nunca debe quedarse.
      localStorage.removeItem('token');

      // Pero la NAVEGACIÓN sólo cuando tiene sentido: si el usuario está
      // viendo una ruta protegida, lo mandamos a login. Si ya está en
      // login (o en otra ruta pública), no hacemos full-page reload —
      // dejamos que el componente que disparó la request maneje el 401
      // (mostrar mensaje, etc.).
      if (!isOnPublicRoute() && !isLoginEndpoint(error.config?.url)) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
