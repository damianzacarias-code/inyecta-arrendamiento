import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calculator,
  FileText,
  Users,
  FolderOpen,
  CalendarDays,
  Shield,
  MapPin,
  ClipboardList,
  BadgeCheck,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cotizador', href: '/cotizador', icon: Calculator },
  { name: 'Cotizaciones', href: '/cotizaciones', icon: FileText },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Contratos', href: '/contratos', icon: FolderOpen },
  { name: 'Cobranza', href: '/cobranza', icon: CalendarDays },
  { name: 'Seguros', href: '/seguros', icon: Shield },
  { name: 'GPS', href: '/gps', icon: MapPin },
  { name: 'Documentos', href: '/documentos', icon: ClipboardList },
  { name: 'Círculo de Crédito', href: '/circulo-credito', icon: BadgeCheck },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-inyecta-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-inyecta-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center font-bold text-white text-sm">
                IN
              </div>
              <div>
                <span className="font-semibold text-sm">Inyecta</span>
                <span className="text-inyecta-300 text-xs block -mt-0.5">Arrendamiento</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-inyecta-300 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-inyecta-700/50 text-white'
                      : 'text-inyecta-200 hover:bg-inyecta-800 hover:text-white'
                  )
                }
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-inyecta-700 p-3">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-inyecta-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-inyecta-600 flex items-center justify-center text-xs font-medium">
                  {user?.nombre?.[0]}{user?.apellidos?.[0]}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium truncate">
                    {user?.nombre} {user?.apellidos}
                  </div>
                  <div className="text-xs text-inyecta-300 truncate">{user?.rol}</div>
                </div>
                <ChevronDown size={14} className="text-inyecta-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-inyecta-800 rounded-lg border border-inyecta-700 py-1 shadow-lg">
                  <NavLink
                    to="/configuracion"
                    onClick={() => { setUserMenuOpen(false); setSidebarOpen(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-inyecta-200 hover:bg-inyecta-700 hover:text-white"
                  >
                    <Settings size={14} />
                    Configuracion
                  </NavLink>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-300 hover:bg-inyecta-700 hover:text-red-200"
                  >
                    <LogOut size={14} />
                    Cerrar Sesion
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden mr-3 text-gray-500 hover:text-gray-700"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
