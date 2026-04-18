import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  Plus, Search, RefreshCw, Building2, User, X, Edit2,
  CalendarClock, FileText, Trash2, Eye, Bell, Sparkles,
} from 'lucide-react';

interface Policy {
  id: string;
  contractId: string;
  aseguradora: string | null;
  numPoliza: string | null;
  tipoCobertura: string | null;
  montoAsegurado: number | string | null;
  primaAnual: number | string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  endosoPref: boolean;
  vigente: boolean;
  observaciones: string | null;
  status: 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'INACTIVA' | 'SIN_FECHA';
  daysToExpire: number | null;
  contract: {
    id: string;
    folio: string;
    bienDescripcion: string;
    bienMarca: string | null;
    bienModelo: string | null;
    estatus: string;
    client: { id: string; tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string };
  };
}

interface SinPolizaContract {
  id: string;
  folio: string;
  bienDescripcion: string;
  client: { tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string };
}

interface Summary {
  total: number;
  vigentes: number;
  porVencer: number;
  vencidas: number;
  inactivas: number;
  sinPoliza: number;
  montoAseguradoTotal: number;
  primaAnualTotal: number;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
  VIGENTE:   { label: 'Vigente',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: ShieldCheck },
  POR_VENCER:{ label: 'Por vencer', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: ShieldAlert },
  VENCIDA:   { label: 'Vencida',    bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     icon: ShieldX },
  INACTIVA:  { label: 'Inactiva',   bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200',    icon: Shield },
  SIN_FECHA: { label: 'Sin fecha',  bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   icon: Shield },
};

function clientName(c: { tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string }) {
  if (c.tipo === 'PM') return c.razonSocial || '';
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ');
}

export default function Seguros() {
  const [data, setData] = useState<Policy[]>([]);
  const [sinPoliza, setSinPoliza] = useState<SinPolizaContract[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState<{ mode: 'create' | 'edit' | 'renew'; policy?: Policy; preselectContractId?: string } | null>(null);
  const [activeContracts, setActiveContracts] = useState<Array<{ id: string; folio: string; bienDescripcion: string }>>([]);
  const [alerts, setAlerts] = useState<{ total: number; criticas: number; altas: number; alerts: any[] } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/insurance' + (filter ? `?status=${filter}` : ''));
      setData(res.data.data);
      setSinPoliza(res.data.sinPoliza);
      setSummary(res.data.summary);
    } catch {}
    setLoading(false);
  };

  const fetchAlerts = () => {
    api.get('/insurance/alerts').then(r => setAlerts(r.data)).catch(() => {});
  };

  useEffect(() => { fetchData(); fetchAlerts(); }, [filter]);

  useEffect(() => {
    api.get('/contracts?limit=200')
      .then(r => {
        setActiveContracts(
          (r.data.data || [])
            .filter((c: any) => ['VIGENTE', 'VENCIDO', 'EN_PROCESO'].includes(c.estatus))
            .map((c: any) => ({ id: c.id, folio: c.folio, bienDescripcion: c.bienDescripcion }))
        );
      })
      .catch(() => {});
  }, []);

  const filtered = data.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.aseguradora || '').toLowerCase().includes(s) ||
      (p.numPoliza || '').toLowerCase().includes(s) ||
      p.contract.folio.toLowerCase().includes(s) ||
      clientName(p.contract.client).toLowerCase().includes(s) ||
      (p.contract.bienDescripcion || '').toLowerCase().includes(s)
    );
  });

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta póliza? Esta acción no se puede deshacer.')) return;
    try {
      await api.delete(`/insurance/${id}`);
      fetchData();
    } catch {}
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={22} className="text-inyecta-600" />
            Pólizas de Seguros
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Endoso preferente a Inyecta SOFOM | Vencimientos y renovaciones</p>
        </div>
        <button
          onClick={() => setShowModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 shadow-sm"
        >
          <Plus size={16} /> Nueva póliza
        </button>
      </div>

      {/* Alertas críticas (vencidas + alta urgencia) */}
      {alerts && alerts.criticas + alerts.altas > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-amber-50 border-l-4 border-red-500 rounded-r-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <Bell size={20} className="text-red-600 flex-shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">
                {alerts.criticas + alerts.altas} alerta{alerts.criticas + alerts.altas !== 1 ? 's' : ''} urgente{alerts.criticas + alerts.altas !== 1 ? 's' : ''}
                {alerts.criticas > 0 && <span className="ml-2 px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">{alerts.criticas} críticas</span>}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {alerts.alerts.filter(a => a.level === 'CRITICA' || a.level === 'ALTA').slice(0, 5).map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.level === 'CRITICA' ? 'bg-red-600' : 'bg-amber-500'}`} />
                    <div className="flex-1">
                      <span className="font-medium">{a.contractFolio}</span>
                      <span className="text-gray-500"> — {a.cliente}</span>
                      <span className="text-gray-700"> · {a.mensaje}</span>
                    </div>
                    {a.kind === 'POLIZA_VENCIMIENTO' && a.policyId && (
                      <button
                        onClick={() => {
                          const pol = data.find(p => p.id === a.policyId);
                          if (pol) setShowModal({ mode: 'renew', policy: pol });
                        }}
                        className="text-xs px-2 py-0.5 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
                      >
                        Renovar
                      </button>
                    )}
                    {a.kind === 'SIN_POLIZA' && (
                      <button
                        onClick={() => setShowModal({ mode: 'create', preselectContractId: a.contractId })}
                        className="text-xs px-2 py-0.5 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
                      >
                        Crear
                      </button>
                    )}
                  </li>
                ))}
                {alerts.alerts.filter(a => a.level === 'CRITICA' || a.level === 'ALTA').length > 5 && (
                  <li className="text-xs text-red-700 ml-3">
                    +{alerts.alerts.filter(a => a.level === 'CRITICA' || a.level === 'ALTA').length - 5} más
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Alert banner: contratos sin póliza */}
      {sinPoliza.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                {sinPoliza.length} contrato{sinPoliza.length !== 1 ? 's' : ''} vigente{sinPoliza.length !== 1 ? 's' : ''} sin póliza activa
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sinPoliza.slice(0, 5).map(c => (
                  <button
                    key={c.id}
                    onClick={() => setShowModal({ mode: 'create', preselectContractId: c.id })}
                    className="inline-flex items-center gap-1.5 text-xs bg-white px-2 py-1 rounded border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                  >
                    <span className="font-mono text-red-700">{c.folio}</span>
                    <span className="text-gray-500 max-w-[200px] truncate">{clientName(c.client)}</span>
                    <Plus size={11} className="text-red-600" />
                  </button>
                ))}
                {sinPoliza.length > 5 && (
                  <span className="text-xs text-red-700 self-center">+{sinPoliza.length - 5} más</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard
            icon={ShieldCheck} iconColor="text-emerald-600"
            label="Vigentes" value={String(summary.vigentes)}
            sub={`Activas`} active={filter === 'VIGENTE'}
            onClick={() => setFilter(filter === 'VIGENTE' ? '' : 'VIGENTE')}
          />
          <StatCard
            icon={ShieldAlert} iconColor="text-amber-600"
            label="Por vencer" value={String(summary.porVencer)}
            sub="≤ 30 días" active={filter === 'POR_VENCER'} alert={summary.porVencer > 0}
            onClick={() => setFilter(filter === 'POR_VENCER' ? '' : 'POR_VENCER')}
          />
          <StatCard
            icon={ShieldX} iconColor="text-red-600"
            label="Vencidas" value={String(summary.vencidas)}
            sub="Atención inmediata" active={filter === 'VENCIDA'} alert={summary.vencidas > 0}
            onClick={() => setFilter(filter === 'VENCIDA' ? '' : 'VENCIDA')}
          />
          <StatCard
            icon={CalendarClock} iconColor="text-blue-600"
            label="Suma asegurada" value={formatCurrency(summary.montoAseguradoTotal)}
            sub="Vigente"
          />
          <StatCard
            icon={FileText} iconColor="text-violet-600"
            label="Prima anual" value={formatCurrency(summary.primaAnualTotal)}
            sub="Total cartera"
          />
        </div>
      )}

      {/* Search + filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por aseguradora, póliza, folio o cliente..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
          />
        </div>
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="flex items-center gap-1 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <X size={12} /> Quitar filtro: {STATUS_CONFIG[filter]?.label}
          </button>
        )}
        <button
          onClick={fetchData}
          className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          title="Refrescar"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Shield size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay pólizas registradas{filter ? ` con estado "${STATUS_CONFIG[filter]?.label}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const cfg = STATUS_CONFIG[p.status];
            const Icon = cfg.icon;
            const c = p.contract;
            return (
              <div key={p.id} className={`bg-white border ${cfg.border} rounded-xl p-4 hover:shadow-sm transition-shadow`}>
                <div className="flex items-start gap-3">
                  <div className={`${cfg.bg} ${cfg.text} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Top row: status + contract folio + client */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                        {cfg.label.toUpperCase()}
                        {p.daysToExpire !== null && p.status === 'POR_VENCER' && ` · ${p.daysToExpire}d`}
                        {p.daysToExpire !== null && p.status === 'VENCIDA' && ` · ${Math.abs(p.daysToExpire)}d atraso`}
                      </span>
                      <Link to={`/contratos/${c.id}`} className="font-mono text-xs text-inyecta-700 hover:underline">
                        {c.folio}
                      </Link>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        {c.client.tipo === 'PM' ? <Building2 size={10} /> : <User size={10} />}
                        {clientName(c.client)}
                      </span>
                      {p.endosoPref && (
                        <span className="text-[10px] bg-inyecta-100 text-inyecta-700 px-1.5 py-0.5 rounded font-medium">
                          ENDOSO PREF.
                        </span>
                      )}
                    </div>

                    {/* Main info */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Aseguradora</p>
                        <p className="text-sm text-gray-900 truncate">{p.aseguradora || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Póliza</p>
                        <p className="text-sm text-gray-900 font-mono">{p.numPoliza || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Suma asegurada</p>
                        <p className="text-sm text-gray-900 font-medium">{p.montoAsegurado ? formatCurrency(Number(p.montoAsegurado)) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Vence</p>
                        <p className={`text-sm font-medium ${
                          p.status === 'VENCIDA' ? 'text-red-600' :
                          p.status === 'POR_VENCER' ? 'text-amber-600' : 'text-gray-900'
                        }`}>
                          {p.fechaVencimiento ? formatDate(p.fechaVencimiento) : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Bien */}
                    <p className="text-xs text-gray-500 mt-2 truncate">
                      {[c.bienMarca, c.bienModelo, c.bienDescripcion].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(p.status === 'POR_VENCER' || p.status === 'VENCIDA') && p.vigente && (
                      <button
                        onClick={() => setShowModal({ mode: 'renew', policy: p })}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-inyecta-700 text-white rounded hover:bg-inyecta-800"
                        title="Renovar"
                      >
                        <RefreshCw size={12} /> Renovar
                      </button>
                    )}
                    <button
                      onClick={() => setShowModal({ mode: 'edit', policy: p })}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PolicyModal
          mode={showModal.mode}
          policy={showModal.policy}
          preselectContractId={showModal.preselectContractId}
          contracts={activeContracts}
          onClose={() => setShowModal(null)}
          onSaved={() => { setShowModal(null); fetchData(); }}
        />
      )}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────
function StatCard({ icon: Icon, iconColor, label, value, sub, active, alert, onClick }: {
  icon: any; iconColor: string; label: string; value: string; sub: string;
  active?: boolean; alert?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white rounded-xl border p-4 text-left transition-all ${
        active ? 'border-inyecta-500 ring-2 ring-inyecta-100' :
        alert ? 'border-red-200' : 'border-gray-200'
      } ${onClick ? 'hover:border-inyecta-300 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={iconColor} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </button>
  );
}

// ─── Modal ───────────────────────────────────────────────────
function PolicyModal({ mode, policy, preselectContractId, contracts, onClose, onSaved }: {
  mode: 'create' | 'edit' | 'renew';
  policy?: Policy;
  preselectContractId?: string;
  contracts: Array<{ id: string; folio: string; bienDescripcion: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isRenew = mode === 'renew';
  const isEdit = mode === 'edit';

  const [form, setForm] = useState({
    contractId: policy?.contractId || preselectContractId || '',
    aseguradora: policy?.aseguradora || 'Seguros El Potosí',
    numPoliza: policy?.numPoliza || '',
    tipoCobertura: policy?.tipoCobertura || 'Cobertura amplia',
    montoAsegurado: policy?.montoAsegurado ? String(policy.montoAsegurado) : '',
    primaAnual: policy?.primaAnual ? String(policy.primaAnual) : '',
    fechaInicio: isRenew ? new Date().toISOString().slice(0, 10) : (policy?.fechaInicio?.slice(0, 10) || ''),
    fechaVencimiento: isRenew
      ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
      : (policy?.fechaVencimiento?.slice(0, 10) || ''),
    endosoPref: policy?.endosoPref ?? true,
    vigente: policy?.vigente ?? true,
    observaciones: policy?.observaciones || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.contractId) return setError('Selecciona un contrato');
    if (!form.aseguradora) return setError('Aseguradora requerida');

    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        montoAsegurado: form.montoAsegurado ? Number(form.montoAsegurado) : undefined,
        primaAnual: form.primaAnual ? Number(form.primaAnual) : undefined,
      };

      if (isRenew && policy) {
        await api.post(`/insurance/${policy.id}/renew`, payload);
      } else if (isEdit && policy) {
        await api.put(`/insurance/${policy.id}`, payload);
      } else {
        await api.post('/insurance', payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al guardar');
    }
    setSaving(false);
  };

  const title = isRenew ? 'Renovar póliza' : isEdit ? 'Editar póliza' : 'Nueva póliza';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Shield size={18} className="text-inyecta-600" />
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {isRenew && policy && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-amber-800">
                    Renovando póliza <span className="font-mono font-semibold">{policy.numPoliza || policy.id.slice(0, 8)}</span> del
                    contrato <span className="font-mono font-semibold">{policy.contract.folio}</span>.
                  </p>
                  <p className="text-amber-600 text-xs mt-1">
                    La póliza anterior se marcará como inactiva y se creará una nueva con los datos de abajo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get(`/insurance/${policy.id}/suggest-renewal`);
                      const d = res.data;
                      setForm(f => ({
                        ...f,
                        fechaInicio: d.fechaInicio.slice(0, 10),
                        fechaVencimiento: d.fechaVencimiento.slice(0, 10),
                        primaAnual: String(d.primaSugerida),
                        montoAsegurado: String(d.montoAsegurado || f.montoAsegurado),
                      }));
                    } catch (e: any) {
                      alert('Error: ' + (e?.response?.data?.error || e.message));
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded hover:bg-purple-200 whitespace-nowrap"
                  title="Sugerir fechas y prima ajustada por inflación (5%)"
                >
                  <Sparkles size={12} /> Sugerir
                </button>
              </div>
            </div>
          )}

          {/* Contract */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Contrato *</label>
            <select
              value={form.contractId}
              onChange={(e) => setForm({ ...form, contractId: e.target.value })}
              disabled={isEdit || isRenew}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none disabled:bg-gray-50"
            >
              <option value="">Selecciona un contrato</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.folio} — {c.bienDescripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aseguradora *" value={form.aseguradora} onChange={v => setForm({ ...form, aseguradora: v })} />
            <Field label="Número de póliza" value={form.numPoliza} onChange={v => setForm({ ...form, numPoliza: v })} mono />
          </div>

          <Field label="Tipo de cobertura" value={form.tipoCobertura} onChange={v => setForm({ ...form, tipoCobertura: v })} placeholder="Cobertura amplia, contra robo, etc." />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Suma asegurada (MXN)" value={form.montoAsegurado} onChange={v => setForm({ ...form, montoAsegurado: v })} type="number" />
            <Field label="Prima anual (MXN)" value={form.primaAnual} onChange={v => setForm({ ...form, primaAnual: v })} type="number" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio" value={form.fechaInicio} onChange={v => setForm({ ...form, fechaInicio: v })} type="date" />
            <Field label="Fecha de vencimiento" value={form.fechaVencimiento} onChange={v => setForm({ ...form, fechaVencimiento: v })} type="date" />
          </div>

          {!isRenew && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.endosoPref}
                  onChange={(e) => setForm({ ...form, endosoPref: e.target.checked })}
                  className="rounded text-inyecta-600 focus:ring-inyecta-500"
                />
                Endoso preferente a Inyecta
              </label>
              {isEdit && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.vigente}
                    onChange={(e) => setForm({ ...form, vigente: e.target.checked })}
                    className="rounded text-inyecta-600 focus:ring-inyecta-500"
                  />
                  Vigente
                </label>
              )}
            </div>
          )}

          {!isRenew && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none resize-none"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 disabled:bg-gray-300"
          >
            {saving ? 'Guardando...' : isRenew ? 'Renovar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', mono, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; mono?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
