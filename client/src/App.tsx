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
import Seguros from '@/pages/Seguros';
import GPS from '@/pages/GPS';
import Documentos from '@/pages/Documentos';
import CirculoCredito from '@/pages/CirculoCredito';
import Reportes from '@/pages/Reportes';
import Facturas from '@/pages/Facturas';

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
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="cotizador" element={<Cotizador />} />
              <Route path="cotizaciones" element={<Cotizaciones />} />
              <Route path="cotizaciones/:id" element={<CotizacionDetalle />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="clientes/nuevo" element={<ClienteNuevo />} />
              <Route path="clientes/:id" element={<ClienteDetalle />} />
              <Route path="contratos" element={<Contratos />} />
              <Route path="contratos/nuevo" element={<ContratoNuevo />} />
              <Route path="contratos/:id" element={<ContratoDetalle />} />
              <Route path="cobranza" element={<Cobranza />} />
              <Route path="seguros" element={<Seguros />} />
              <Route path="gps" element={<GPS />} />
              <Route path="documentos" element={<Documentos />} />
              <Route path="circulo-credito" element={<CirculoCredito />} />
              <Route path="reportes" element={<Reportes />} />
              <Route path="facturas" element={<Facturas />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
