/**
 * Layout principal del sistema — réplica del sidebar del sistema legacy
 * ---------------------------------------------------------------------
 *   Sidebar:     #184892   (fondo legacy)
 *   Hover/header:#112239   (acción principal)
 *   Acento:      #FF6600   (usuario / enlace activo)
 *   Font:        Roboto
 *   Layout:      3 niveles (Sección → Item → Subitem) con accordion.
 *
 * Conserva AuthContext, CommandPalette y el Outlet de react-router.
 */
import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  ChevronRight,
  LogOut,
  Menu,
  X,
  Search,
  UserRound,
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import NotificationBell from './NotificationBell';
import { NAV_SECTIONS, findActiveBranch } from '@/config/navigation';

const SIDEBAR_BG     = '#184892';
const SIDEBAR_HOVER  = '#112239';
const TEXT_COLOR     = '#FFFFFF';
const TEXT_MUTED     = 'rgba(255,255,255,0.85)';
const ACCENT_ORANGE  = '#FF6600';
const DIVIDER        = 'rgba(255,255,255,0.15)';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen]   = useState(false); // mobile only
  const [openSection, setOpenSection]   = useState<string | null>(null);
  const [openItem,    setOpenItem]      = useState<string | null>(null);

  // Abre automáticamente la rama activa al navegar (o al cargar directo)
  useEffect(() => {
    const branch = findActiveBranch(location.pathname);
    if (branch.section) setOpenSection(branch.section);
    if (branch.item)    setOpenItem(branch.item);
  }, [location.pathname]);

  const toggleSection = (label: string) =>
    setOpenSection(prev => (prev === label ? null : label));
  const toggleItem = (label: string) =>
    setOpenItem(prev => (prev === label ? null : label));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userName = `${user?.nombre ?? ''} ${user?.apellidos ?? ''}`.trim().toUpperCase() || 'USUARIO';

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ───── Sidebar ───── */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-50 w-56 transform transition-transform ' +
          'lg:translate-x-0 lg:static lg:z-auto ' +
          (sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')
        }
        style={{
          backgroundColor: SIDEBAR_BG,
          color: TEXT_COLOR,
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '18px 12px 12px',
            textAlign: 'center',
            borderBottom: `1px solid ${DIVIDER}`,
            position: 'relative',
          }}
        >
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'transparent',
              border: 'none',
              color: TEXT_MUTED,
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>

          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#FFFFFF',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            }}
          >
            <img
              src="/brand/logo-inyecta-simbolo.png"
              alt="Inyecta"
              style={{ width: 52, height: 52, objectFit: 'contain' }}
            />
          </div>
          <div style={{ fontWeight: 700, marginTop: 6, letterSpacing: 1 }}>INYECTA</div>
          <div
            style={{
              color: ACCENT_ORANGE,
              fontSize: 11,
              marginTop: 3,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <UserRound size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {userName}
            </span>
          </div>
        </div>

        {/* Navegación */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {NAV_SECTIONS.map(section => {
            const SectionIcon = section.icon;
            const sectionOpen = openSection === section.label;

            // Sección "Inicio" tiene un único item directo → colapsamos visualmente
            const singleDirect = section.items.length === 1 && section.items[0].path && !section.items[0].children;
            if (singleDirect) {
              const only = section.items[0];
              const OnlyIcon = only.icon;
              const active = location.pathname === only.path;
              return (
                <NavLink
                  key={section.label}
                  to={only.path!}
                  end
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    color: active ? ACCENT_ORANGE : TEXT_COLOR,
                    textDecoration: 'none',
                    fontWeight: 600,
                    backgroundColor: active ? 'rgba(0,0,0,0.22)' : 'transparent',
                    borderLeft: active ? `3px solid ${ACCENT_ORANGE}` : '3px solid transparent',
                  }}
                >
                  <OnlyIcon size={15} />
                  <span>{only.label}</span>
                </NavLink>
              );
            }

            return (
              <div key={section.label}>
                <button
                  onClick={() => toggleSection(section.label)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    background: sectionOpen ? SIDEBAR_HOVER : 'transparent',
                    border: 'none',
                    color: TEXT_COLOR,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SectionIcon size={15} />
                    {section.label}
                  </span>
                  <ChevronRight
                    size={13}
                    style={{
                      transform: sectionOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s',
                    }}
                  />
                </button>

                {sectionOpen && (
                  <div>
                    {section.items.map(item => {
                      const ItemIcon = item.icon;
                      const itemOpen = openItem === item.label;

                      if (!item.children) {
                        const active = location.pathname === item.path;
                        return (
                          <NavLink
                            key={item.label}
                            to={item.path!}
                            onClick={() => setSidebarOpen(false)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 16px 8px 34px',
                              color: active ? ACCENT_ORANGE : TEXT_MUTED,
                              textDecoration: 'none',
                              fontSize: 12,
                              backgroundColor: active ? 'rgba(0,0,0,0.22)' : 'transparent',
                              borderLeft: active ? `3px solid ${ACCENT_ORANGE}` : '3px solid transparent',
                            }}
                          >
                            <ItemIcon size={13} />
                            {item.label}
                          </NavLink>
                        );
                      }

                      return (
                        <div key={item.label}>
                          <button
                            onClick={() => toggleItem(item.label)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 16px 8px 34px',
                              background: itemOpen ? SIDEBAR_HOVER : 'transparent',
                              border: 'none',
                              color: TEXT_COLOR,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ItemIcon size={13} />
                              {item.label}
                            </span>
                            <ChevronRight
                              size={11}
                              style={{
                                transform: itemOpen ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s',
                              }}
                            />
                          </button>

                          {itemOpen && (
                            <div>
                              {item.children.map(sub => {
                                const active =
                                  location.pathname === sub.path ||
                                  location.pathname.startsWith(sub.path + '/');
                                return (
                                  <Link
                                    key={sub.path}
                                    to={sub.path}
                                    onClick={() => setSidebarOpen(false)}
                                    style={{
                                      display: 'block',
                                      padding: '7px 16px 7px 52px',
                                      color: active ? ACCENT_ORANGE : TEXT_MUTED,
                                      textDecoration: 'none',
                                      fontSize: 12,
                                      backgroundColor: active ? 'rgba(0,0,0,0.22)' : 'transparent',
                                      borderLeft: active
                                        ? `3px solid ${ACCENT_ORANGE}`
                                        : '3px solid transparent',
                                      transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                      if (!active) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.15)';
                                    }}
                                    onMouseLeave={e => {
                                      if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                  >
                                    {sub.label}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Cerrar sesión */}
        <div style={{ borderTop: `1px solid ${DIVIDER}`, padding: '10px 16px' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: 'none',
              color: TEXT_MUTED,
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 0',
            }}
          >
            <LogOut size={13} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ───── Main ───── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top bar oscura (estilo legacy) */}
        <header
          style={{
            backgroundColor: SIDEBAR_HOVER,
            color: TEXT_MUTED,
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
            style={{ background: 'transparent', border: 'none', color: TEXT_MUTED, cursor: 'pointer' }}
          >
            <Menu size={18} />
          </button>
          <span>{user?.nombre} {user?.apellidos} <span style={{ opacity: 0.6 }}>· {user?.rol}</span></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationBell />
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: TEXT_MUTED,
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <LogOut size={12} />
              Cerrar Sesión
            </button>
          </div>
        </header>

        {/* Búsqueda (Cmd+K) */}
        <div
          style={{
            background: '#FFFFFF',
            borderBottom: '1px solid #e5e7eb',
            padding: '8px 16px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              const evt = new KeyboardEvent('keydown', {
                key: 'k', metaKey: true, ctrlKey: true, bubbles: true,
              });
              window.dispatchEvent(evt);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-sm text-gray-500 transition-colors w-full max-w-md"
            style={{ fontFamily: "'Roboto', sans-serif" }}
          >
            <Search size={13} />
            <span>Buscar...</span>
            <span className="ml-auto text-[10px] font-medium text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-200">
              ⌘K
            </span>
          </button>
        </div>
        <CommandPalette />

        {/* Contenido */}
        <main style={{ flex: 1, background: '#FFFFFF', overflowY: 'auto' }} className="p-4 lg:p-6">
          <Outlet />
        </main>

        {/* Footer legacy */}
        <footer
          style={{
            backgroundColor: '#f5f5f5',
            borderTop: '1px solid #e0e0e0',
            padding: '6px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            color: '#666',
            flexShrink: 0,
          }}
        >
          <span>Digital Invoice 2026 © 5.3.3.9</span>
          <span>Inyecta Arrendamiento</span>
        </footer>
      </div>
    </div>
  );
}
