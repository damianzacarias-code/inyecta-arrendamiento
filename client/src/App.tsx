import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { loadBranding } from '@/lib/branding';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Cotizador from '@/pages/Cotizador';
import Cotizaciones from '@/pages/Cotizaciones';
import CotizacionDetalle from '@/pages/CotizacionDetalle';
import Clientes from '@/pages/Clientes';
import ClienteNuevo from '@/pages/ClienteNuevo';
import ClienteDetalle from '@/pages/ClienteDetalle';
import Contratos from '@/pages/Contratos';
import ContratoNuevo from '@/pages/ContratoNuevo';
import ContratoDetalle from '@/pages/ContratoDetalle';
import CargarSolicitud from '@/pages/CargarSolicitud';
import Cobranza from '@/pages/Cobranza';
import CobranzaContrato from '@/pages/CobranzaContrato';
import Seguros from '@/pages/Seguros';
import GPS from '@/pages/GPS';
import Documentos from '@/pages/Documentos';
import CirculoCredito from '@/pages/CirculoCredito';
import Facturas from '@/pages/Facturas';
import Portal from '@/pages/Portal';
import Conciliacion from '@/pages/Conciliacion';
// ─── Reportes (antes dispersos en Estadisticas*, Reportes, Bitacora) ──
import ReportesHub from '@/pages/reportes/Hub';
import ReportesPortafolio from '@/pages/reportes/Portafolio';
import ReportesProduccion from '@/pages/reportes/Produccion';
import ReportesMetricas from '@/pages/reportes/Metricas';
import ReportesBitacora from '@/pages/reportes/Bitacora';
import AdminTemplates from '@/pages/admin/Templates';
import AdminCatalogo from '@/pages/admin/Catalogo';
import AdminUsuarios from '@/pages/admin/Usuarios';
import Perfil from '@/pages/Perfil';
import EnConstruccion from '@/pages/EnConstruccion';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  // Branding al boot — endpoint público, fire-and-forget. Si falla, los
  // componentes (PDFs, /portal) caen al default hardcoded, no rompe UI.
  //
  // El catálogo NO se carga aquí (antes sí, pero requiere auth y disparaba
  // un loop "401 → redirect a /login → re-mount → 401 → ..."). Lo carga
  // ahora AuthContext: al rehidratar sesión válida (useEffect con /auth/me)
  // y tras un login exitoso. Ver lib/catalog.ts y context/AuthContext.tsx.
  useEffect(() => {
    void loadBranding();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/portal/:token" element={<Portal />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />

              {/* ─── Cotizador unificado (toggle Puro / Financiero dentro) ─── */}
              <Route path="cotizador" element={<Cotizador />} />
              <Route path="cotizaciones" element={<Cotizaciones />} />
              <Route path="cotizaciones/:id" element={<CotizacionDetalle />} />

              {/* ─── Arrendatarios (alias legacy: clientes) ─── */}
              <Route path="clientes" element={<Clientes />} />
              <Route path="clientes/nuevo" element={<ClienteNuevo />} />
              <Route path="clientes/:id" element={<ClienteDetalle />} />

              {/* ─── Operaciones (alias legacy: contratos) ─── */}
              <Route path="contratos" element={<Contratos />} />
              <Route path="contratos/nuevo" element={<ContratoNuevo />} />
              <Route path="contratos/:id" element={<ContratoDetalle />} />
              <Route path="operaciones/dispersion" element={<EnConstruccion titulo="Operaciones · Dispersión" />} />

              {/* ─── Cobranza ─── */}
              <Route path="cobranza" element={<Cobranza />} />
              <Route path="cobranza/contrato/:id" element={<CobranzaContrato />} />
              <Route path="cobranza/moratorios" element={<EnConstruccion titulo="Cobranza · Moratorios" />} />

              {/* ─── Regulación y catálogos extra ─── */}
              <Route path="seguros" element={<Seguros />} />
              <Route path="gps" element={<GPS />} />
              <Route path="documentos" element={<Documentos />} />
              <Route path="circulo-credito" element={<CirculoCredito />} />

              {/* ─── Administración / Catálogos ─── */}
              {/* /admin/catalogo unifica tasas+comisiones+GPS+presets de riesgo
                  en una sola página (las rutas legacy redirigen ahí). */}
              <Route path="admin/catalogo" element={<AdminCatalogo />} />
              <Route path="admin/tasas" element={<Navigate to="/admin/catalogo" replace />} />
              <Route path="admin/comisiones" element={<Navigate to="/admin/catalogo" replace />} />
              <Route path="admin/templates" element={<AdminTemplates />} />
              <Route path="admin/usuarios" element={<AdminUsuarios />} />

              {/* ─── Perfil del usuario autenticado (cambio de pwd + MFA opt-in) ─── */}
              <Route path="perfil" element={<Perfil />} />

              {/* ─── CRM (stubs, fuera del menú) ─── */}
              <Route path="crm" element={<EnConstruccion titulo="CRM · Prospectos" />} />
              <Route path="crm/calendario" element={<EnConstruccion titulo="CRM · Calendario de Actividades" />} />

              {/* ─── Solicitudes ─── */}
              <Route path="solicitudes/cargar" element={<CargarSolicitud />} />
              <Route path="solicitudes/nueva" element={<EnConstruccion titulo="Solicitudes · Nueva" />} />
              <Route path="solicitudes/excel" element={<EnConstruccion titulo="Solicitudes · Carga Masiva" />} />

              {/* ─── Reportes unificados (hub + vistas dedicadas) ─── */}
              <Route path="reportes"                   element={<ReportesHub />} />
              <Route path="reportes/cartera-vencida"   element={<ReportesHub />} />
              <Route path="reportes/cobranza"          element={<ReportesHub />} />
              <Route path="reportes/rentabilidad"      element={<ReportesHub />} />
              <Route path="reportes/portafolio"        element={<ReportesPortafolio />} />
              <Route path="reportes/produccion"        element={<ReportesProduccion />} />
              <Route path="reportes/metricas"          element={<ReportesMetricas />} />
              <Route path="reportes/bitacora"          element={<ReportesBitacora />} />

              {/* ─── Redirects legacy (/estadisticas/* y /admin/bitacora) ─── */}
              <Route path="estadisticas/portafolio" element={<Navigate to="/reportes/portafolio"      replace />} />
              <Route path="estadisticas/vencida"    element={<Navigate to="/reportes/cartera-vencida" replace />} />
              <Route path="estadisticas/produccion" element={<Navigate to="/reportes/produccion"      replace />} />
              <Route path="estadisticas/metricas"   element={<Navigate to="/reportes/metricas"        replace />} />
              <Route path="admin/bitacora"          element={<Navigate to="/reportes/bitacora"        replace />} />

              {/* ─── Facturación ─── */}
              <Route path="facturas" element={<Facturas />} />
              <Route path="conciliacion" element={<Conciliacion />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
