import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
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
import Cobranza from '@/pages/Cobranza';
import CobranzaContrato from '@/pages/CobranzaContrato';
import Seguros from '@/pages/Seguros';
import GPS from '@/pages/GPS';
import Documentos from '@/pages/Documentos';
import CirculoCredito from '@/pages/CirculoCredito';
import Reportes from '@/pages/Reportes';
import Facturas from '@/pages/Facturas';
import Portal from '@/pages/Portal';
import Conciliacion from '@/pages/Conciliacion';
import EnConstruccion from '@/pages/EnConstruccion';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
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
              <Route path="admin/tasas" element={<EnConstruccion titulo="Administración · Tasas de Interés" />} />
              <Route path="admin/comisiones" element={<EnConstruccion titulo="Administración · Comisiones" />} />

              {/* ─── CRM ─── */}
              <Route path="crm" element={<EnConstruccion titulo="CRM · Prospectos" />} />
              <Route path="crm/calendario" element={<EnConstruccion titulo="CRM · Calendario de Actividades" />} />

              {/* ─── Solicitudes ─── */}
              <Route path="solicitudes/nueva" element={<EnConstruccion titulo="Solicitudes · Nueva" />} />
              <Route path="solicitudes/excel" element={<EnConstruccion titulo="Solicitudes · Carga Masiva" />} />

              {/* ─── Reportes / Estadísticas ─── */}
              <Route path="reportes" element={<Reportes />} />
              <Route path="estadisticas/portafolio" element={<EnConstruccion titulo="Estadísticas · Portafolio Vigente" />} />
              <Route path="estadisticas/vencida" element={<EnConstruccion titulo="Estadísticas · Cartera Vencida" />} />
              <Route path="estadisticas/produccion" element={<EnConstruccion titulo="Estadísticas · Producción Mensual" />} />

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
