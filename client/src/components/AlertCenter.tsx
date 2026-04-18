/**
 * AlertCenter — Centro de Alertas para el Dashboard
 *
 * Consume GET /api/alerts y muestra:
 *  - Resumen por nivel de severidad (CRITICA / ALTA / MEDIA)
 *  - Lista de las alertas más prioritarias (top 8)
 *  - Tabs para filtrar por tipo (todas / cobranza / seguros / documentos)
 *  - Cada alerta es clickable y navega al CTA correspondiente
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bell,
  CalendarDays,
  Shield,
  FileText,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

type AlertLevel = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
type AlertKind = 'COBRANZA_VENCIDA' | 'POLIZA_VENCIMIENTO' | 'SIN_POLIZA' | 'DOCUMENTO_VENCIDO';

interface UnifiedAlert {
  kind: AlertKind;
  level: AlertLevel;
  contractId?: string;
  contractFolio?: string;
  cliente: string;
  mensaje: string;
  actionUrl: string;
  monto?: number;
  diasAtraso?: number;
  diasRestantes?: number;
}

interface AlertsResponse {
  total: number;
  summary: { criticas: number; altas: number; medias: number; bajas: number };
  byKind: { cobranza: number; seguros: number; documentos: number };
  alerts: UnifiedAlert[];
}

type FilterKind = 'all' | 'cobranza' | 'seguros' | 'documentos';

const LEVEL_STYLES: Record<AlertLevel, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  CRITICA: { color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       icon: AlertTriangle },
  ALTA:    { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertCircle   },
  MEDIA:   { color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: Bell          },
  BAJA:    { color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: Info          },
};

const KIND_ICONS: Record<AlertKind, typeof CalendarDays> = {
  COBRANZA_VENCIDA:    CalendarDays,
  POLIZA_VENCIMIENTO:  Shield,
  SIN_POLIZA:          Shield,
  DOCUMENTO_VENCIDO:   FileText,
};

const KIND_LABELS: Record<AlertKind, string> = {
  COBRANZA_VENCIDA:    'Cobranza',
  POLIZA_VENCIMIENTO:  'Seguro',
  SIN_POLIZA:          'Seguro',
  DOCUMENTO_VENCIDO:   'Documento',
};

export default function AlertCenter() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKind>('all');

  useEffect(() => {
    api.get('/alerts')
      .then(res => setData(res.data))
      .catch(err => console.error('Alerts fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="animate-pulse h-6 w-48 bg-gray-100 rounded mb-3" />
        <div className="space-y-2">
          <div className="animate-pulse h-12 bg-gray-50 rounded" />
          <div className="animate-pulse h-12 bg-gray-50 rounded" />
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 mb-6 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-emerald-600" />
        <div>
          <p className="text-sm font-medium text-emerald-800">Sin alertas pendientes</p>
          <p className="text-xs text-emerald-600">Todo está al corriente. ¡Excelente trabajo!</p>
        </div>
      </div>
    );
  }

  const filtered = data.alerts.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'cobranza') return a.kind === 'COBRANZA_VENCIDA';
    if (filter === 'seguros') return a.kind === 'POLIZA_VENCIMIENTO' || a.kind === 'SIN_POLIZA';
    if (filter === 'documentos') return a.kind === 'DOCUMENTO_VENCIDO';
    return true;
  });

  const visibles = filtered.slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-inyecta-600" />
          <h3 className="text-sm font-semibold text-gray-700">Centro de Alertas</h3>
          <span className="text-xs text-gray-400">· {data.total} totales</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {data.summary.criticas > 0 && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">
              {data.summary.criticas} críticas
            </span>
          )}
          {data.summary.altas > 0 && (
            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
              {data.summary.altas} altas
            </span>
          )}
          {data.summary.medias > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
              {data.summary.medias} medias
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 border-b border-gray-100 flex gap-1">
        {([
          ['all',        `Todas (${data.total})`],
          ['cobranza',   `Cobranza (${data.byKind.cobranza})`],
          ['seguros',    `Seguros (${data.byKind.seguros})`],
          ['documentos', `Documentos (${data.byKind.documentos})`],
        ] as Array<[FilterKind, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 transition-colors ${
              filter === k
                ? 'border-inyecta-600 text-inyecta-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
        {visibles.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            Sin alertas en esta categoría
          </div>
        ) : (
          visibles.map((alert, idx) => {
            const LevelIcon = LEVEL_STYLES[alert.level].icon;
            const KindIcon = KIND_ICONS[alert.kind];
            return (
              <Link
                key={`${alert.kind}-${alert.contractId || alert.cliente}-${idx}`}
                to={alert.actionUrl}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${LEVEL_STYLES[alert.level].bg}`}>
                  <LevelIcon size={14} className={LEVEL_STYLES[alert.level].color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${LEVEL_STYLES[alert.level].bg} ${LEVEL_STYLES[alert.level].color}`}>
                      {alert.level}
                    </span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-1">
                      <KindIcon size={10} />
                      {KIND_LABELS[alert.kind]}
                    </span>
                    {alert.contractFolio && (
                      <span className="font-mono text-[11px] text-inyecta-700">
                        {alert.contractFolio}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 truncate">{alert.mensaje}</p>
                  <p className="text-[11px] text-gray-500 truncate">{alert.cliente}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0 mt-2" />
              </Link>
            );
          })
        )}
      </div>

      {/* Footer */}
      {filtered.length > visibles.length && (
        <div className="px-5 py-2.5 border-t border-gray-100 text-center">
          <span className="text-xs text-gray-500">
            Mostrando {visibles.length} de {filtered.length} alertas
          </span>
        </div>
      )}
    </div>
  );
}
