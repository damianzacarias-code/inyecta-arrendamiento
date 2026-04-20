/**
 * NotificationBell — Campana de notificaciones in-app
 * ---------------------------------------------------------------
 * CLAUDE.md §9 T9 — Wiring UI sobre la API ya existente
 * (T9 backend: server/src/lib/notificar.ts + routes/notificaciones.ts).
 *
 *   - Badge con contador de no leídas (polling cada 30s a /contador).
 *   - Panel desplegable con las últimas 15 notificaciones.
 *   - Click en una notificación: marca como leída y navega a su `url`.
 *   - Footer: "Marcar todas como leídas".
 *
 * Diseñada para vivir en el topbar oscuro (#112239) del Layout, por
 * eso la campana usa color claro y el badge naranja del branding.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  X,
  FilePlus,
  ChevronRight,
  CheckCircle2,
  XCircle,
  CreditCard,
  AlertTriangle,
  FastForward,
  TrendingDown,
  FileCheck,
  FileX,
  Inbox,
} from 'lucide-react';
import api from '@/lib/api';

const ACCENT_ORANGE = '#FF6600';
const TEXT_MUTED = 'rgba(255,255,255,0.85)';

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  entidad: string | null;
  entidadId: string | null;
  url: string | null;
  leida: boolean;
  leidaAt: string | null;
  createdAt: string;
}

interface ListaResponse {
  page: number;
  pageSize: number;
  total: number;
  noLeidas: number;
  items: Notificacion[];
}

const TIPO_META: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  SOLICITUD_CREADA:    { icon: FilePlus,     color: 'text-indigo-700',  bg: 'bg-indigo-50' },
  ETAPA_AVANZADA:      { icon: ChevronRight, color: 'text-blue-700',    bg: 'bg-blue-50' },
  CONTRATO_ACTIVADO:   { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  CONTRATO_RESCINDIDO: { icon: XCircle,      color: 'text-red-700',     bg: 'bg-red-50' },
  PAGO_REGISTRADO:     { icon: CreditCard,   color: 'text-emerald-700', bg: 'bg-emerald-50' },
  PAGO_PARCIAL:        { icon: AlertTriangle,color: 'text-amber-700',   bg: 'bg-amber-50' },
  PAGO_ADELANTADO:     { icon: FastForward,  color: 'text-sky-700',     bg: 'bg-sky-50' },
  ABONO_CAPITAL:       { icon: TrendingDown, color: 'text-teal-700',    bg: 'bg-teal-50' },
  COTIZACION_APROBADA: { icon: FileCheck,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
  COTIZACION_RECHAZADA:{ icon: FileX,        color: 'text-red-700',     bg: 'bg-red-50' },
};

const META_DEFAULT = { icon: Bell, color: 'text-gray-700', bg: 'bg-gray-100' };

const POLL_MS = 30_000;

function tiempoRelativo(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const dias = Math.floor(hr / 24);
  if (dias < 7) return `hace ${dias} d`;
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Polling del contador
  useEffect(() => {
    let cancel = false;
    const tick = async () => {
      try {
        const { data } = await api.get<{ noLeidas: number }>('/notificaciones/contador');
        if (!cancel) setNoLeidas(data.noLeidas);
      } catch (err) {
        // Silencioso: no queremos romper la UI por una notificación
        console.error('Notif contador error:', err);
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, []);

  // Cargar lista cuando se abre el panel
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setCargando(true);
    api
      .get<ListaResponse>('/notificaciones', { params: { pageSize: 15 } })
      .then(({ data }) => {
        if (cancel) return;
        setLista(data.items);
        setNoLeidas(data.noLeidas);
      })
      .catch(err => console.error('Notif lista error:', err))
      .finally(() => {
        if (!cancel) setCargando(false);
      });
    return () => {
      cancel = true;
    };
  }, [open]);

  // Cerrar panel al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const marcarLeida = async (n: Notificacion) => {
    if (n.leida) return;
    // Optimista
    setLista(prev => prev.map(x => (x.id === n.id ? { ...x, leida: true } : x)));
    setNoLeidas(c => Math.max(0, c - 1));
    try {
      await api.patch(`/notificaciones/${n.id}/leida`);
    } catch (err) {
      console.error('Notif leida error:', err);
    }
  };

  const handleClickItem = async (n: Notificacion) => {
    await marcarLeida(n);
    setOpen(false);
    if (n.url) navigate(n.url);
  };

  const handleLeerTodas = async () => {
    if (noLeidas === 0) return;
    setLista(prev => prev.map(x => ({ ...x, leida: true })));
    setNoLeidas(0);
    try {
      await api.patch('/notificaciones/leer-todas');
    } catch (err) {
      console.error('Notif leer-todas error:', err);
    }
  };

  const handleEliminar = async (e: React.MouseEvent, n: Notificacion) => {
    e.stopPropagation();
    setLista(prev => prev.filter(x => x.id !== n.id));
    if (!n.leida) setNoLeidas(c => Math.max(0, c - 1));
    try {
      await api.delete(`/notificaciones/${n.id}`);
    } catch (err) {
      console.error('Notif delete error:', err);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notificaciones"
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} sin leer)` : ''}`}
        style={{
          background: 'transparent',
          border: 'none',
          color: TEXT_MUTED,
          cursor: 'pointer',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <Bell size={16} />
        {noLeidas > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              background: ACCENT_ORANGE,
              color: '#FFFFFF',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              boxShadow: '0 0 0 2px #112239',
            }}
          >
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            background: '#FFFFFF',
            color: '#1f2937',
            borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            border: '1px solid #e5e7eb',
            zIndex: 1000,
            overflow: 'hidden',
            fontSize: 13,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={14} style={{ color: '#475569' }} />
              <span style={{ fontWeight: 600, color: '#0f172a' }}>Notificaciones</span>
              {noLeidas > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: ACCENT_ORANGE,
                    fontWeight: 600,
                  }}
                >
                  · {noLeidas} sin leer
                </span>
              )}
            </div>
            <button
              onClick={handleLeerTodas}
              disabled={noLeidas === 0}
              title="Marcar todas como leídas"
              style={{
                background: 'transparent',
                border: 'none',
                color: noLeidas === 0 ? '#cbd5e1' : '#0f172a',
                cursor: noLeidas === 0 ? 'default' : 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 6px',
                borderRadius: 4,
              }}
            >
              <CheckCheck size={12} />
              Leer todas
            </button>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {cargando ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                Cargando…
              </div>
            ) : lista.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Inbox size={28} style={{ color: '#cbd5e1' }} />
                <div>Sin notificaciones</div>
              </div>
            ) : (
              lista.map(n => {
                const meta = TIPO_META[n.tipo] || META_DEFAULT;
                const Icon = meta.icon;
                const clickable = Boolean(n.url);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    role={clickable ? 'button' : undefined}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '10px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: clickable ? 'pointer' : 'default',
                      background: n.leida ? '#FFFFFF' : '#fff7ed',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = n.leida ? '#f8fafc' : '#ffedd5';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = n.leida ? '#FFFFFF' : '#fff7ed';
                    }}
                  >
                    <div
                      className={meta.bg}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={14} className={meta.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontWeight: n.leida ? 500 : 700,
                            color: '#0f172a',
                            fontSize: 13,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.titulo}
                        </span>
                        {!n.leida && (
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: ACCENT_ORANGE,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                      {n.mensaje && (
                        <div
                          style={{
                            color: '#475569',
                            fontSize: 12,
                            marginTop: 2,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {n.mensaje}
                        </div>
                      )}
                      <div
                        style={{
                          color: '#94a3b8',
                          fontSize: 11,
                          marginTop: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span>{tiempoRelativo(n.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={e => handleEliminar(e, n)}
                      title="Eliminar"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        padding: 2,
                        height: 'fit-content',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#ef4444';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#cbd5e1';
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
