import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  MapPin, Wifi, WifiOff, AlertTriangle, Plus, Search, RefreshCw,
  Building2, User, X, Edit2, Trash2, PowerOff, DollarSign, Cpu,
} from 'lucide-react';

interface GPSDevice {
  id: string;
  contractId: string;
  marca: string | null;
  modelo: string | null;
  numSerie: string | null;
  proveedor: string | null;
  fechaInstalacion: string | null;
  activo: boolean;
  costoInstalacion: number | string | null;
  observaciones: string | null;
  contract: {
    id: string;
    folio: string;
    bienDescripcion: string;
    bienMarca: string | null;
    bienModelo: string | null;
    bienNumSerie: string | null;
    estatus: string;
    categoria?: { id: string; nombre: string; requiereGPS: boolean };
    client: { id: string; tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string; telefono?: string };
  };
}

interface SinGPSContract {
  id: string;
  folio: string;
  bienDescripcion: string;
  bienMarca: string | null;
  bienModelo: string | null;
  categoria?: string;
  client: { tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string };
}

interface Summary {
  total: number;
  activos: number;
  inactivos: number;
  sinGPS: number;
  inversionTotal: number;
  inversionActiva: number;
  porProveedor: Array<{ proveedor: string; count: number }>;
}

function clientName(c: { tipo: string; nombre?: string; apellidoPaterno?: string; razonSocial?: string }) {
  if (c.tipo === 'PM') return c.razonSocial || '';
  return [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ');
}

export default function GPS() {
  const [data, setData] = useState<GPSDevice[]>([]);
  const [sinGPS, setSinGPS] = useState<SinGPSContract[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState<{ mode: 'create' | 'edit' | 'uninstall'; device?: GPSDevice; preselectContractId?: string } | null>(null);
  const [activeContracts, setActiveContracts] = useState<Array<{ id: string; folio: string; bienDescripcion: string }>>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const qs = filter === 'active' ? '?activo=true' : filter === 'inactive' ? '?activo=false' : '';
      const res = await api.get('/gps' + qs);
      setData(res.data.data);
      setSinGPS(res.data.sinGPS);
      setSummary(res.data.summary);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filter]);

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

  const filtered = data.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (d.marca || '').toLowerCase().includes(s) ||
      (d.modelo || '').toLowerCase().includes(s) ||
      (d.numSerie || '').toLowerCase().includes(s) ||
      (d.proveedor || '').toLowerCase().includes(s) ||
      d.contract.folio.toLowerCase().includes(s) ||
      clientName(d.contract.client).toLowerCase().includes(s)
    );
  });

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este dispositivo? Esta acción no se puede deshacer.\nSi el equipo fue retirado físicamente, mejor marca como "Retirado" para conservar el historial.')) return;
    try {
      await api.delete(`/gps/${id}`);
      fetchData();
    } catch {}
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={22} className="text-inyecta-600" />
            Dispositivos GPS
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Trazabilidad de activos móviles | Instalación obligatoria según categoría</p>
        </div>
        <button
          onClick={() => setShowModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 shadow-sm"
        >
          <Plus size={16} /> Registrar dispositivo
        </button>
      </div>

      {/* Alert banner: contratos sin GPS */}
      {sinGPS.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                {sinGPS.length} contrato{sinGPS.length !== 1 ? 's' : ''} requiere{sinGPS.length !== 1 ? 'n' : ''} GPS y no lo tiene{sinGPS.length !== 1 ? 'n' : ''} instalado
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sinGPS.slice(0, 6).map(c => (
                  <button
                    key={c.id}
                    onClick={() => setShowModal({ mode: 'create', preselectContractId: c.id })}
                    className="inline-flex items-center gap-1.5 text-xs bg-white px-2 py-1 rounded border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                  >
                    <span className="font-mono text-red-700">{c.folio}</span>
                    <span className="text-gray-500 max-w-[240px] truncate">
                      {[c.bienMarca, c.bienModelo].filter(Boolean).join(' ') || c.bienDescripcion}
                    </span>
                    <Plus size={11} className="text-red-600" />
                  </button>
                ))}
                {sinGPS.length > 6 && (
                  <span className="text-xs text-red-700 self-center">+{sinGPS.length - 6} más</span>
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
            icon={Wifi} iconColor="text-emerald-600"
            label="Activos" value={String(summary.activos)} sub="Instalados y operativos"
            active={filter === 'active'} onClick={() => setFilter(filter === 'active' ? 'all' : 'active')}
          />
          <StatCard
            icon={WifiOff} iconColor="text-gray-500"
            label="Retirados" value={String(summary.inactivos)} sub="Equipos recuperados"
            active={filter === 'inactive'} onClick={() => setFilter(filter === 'inactive' ? 'all' : 'inactive')}
          />
          <StatCard
            icon={AlertTriangle} iconColor="text-red-600"
            label="Sin GPS" value={String(summary.sinGPS)} sub="Requieren instalación"
            alert={summary.sinGPS > 0}
          />
          <StatCard
            icon={DollarSign} iconColor="text-blue-600"
            label="Inversión activa" value={formatCurrency(summary.inversionActiva)} sub="En dispositivos instalados"
          />
          <StatCard
            icon={Cpu} iconColor="text-violet-600"
            label="Proveedores" value={String(summary.porProveedor.length)}
            sub={summary.porProveedor.map(p => p.proveedor).slice(0, 2).join(', ') || '—'}
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
            placeholder="Buscar por marca, serie, proveedor, folio o cliente..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
          />
        </div>
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className="flex items-center gap-1 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <X size={12} /> Ver todos
          </button>
        )}
        <button onClick={fetchData} className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50" title="Refrescar">
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
          <MapPin size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay dispositivos registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => {
            const c = d.contract;
            return (
              <div key={d.id} className={`bg-white border rounded-xl p-4 hover:shadow-sm transition-shadow ${
                d.activo ? 'border-gray-200' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    d.activo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {d.activo ? <Wifi size={18} /> : <WifiOff size={18} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        d.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {d.activo ? 'ACTIVO' : 'RETIRADO'}
                      </span>
                      <Link to={`/contratos/${c.id}`} className="font-mono text-xs text-inyecta-700 hover:underline">
                        {c.folio}
                      </Link>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        {c.client.tipo === 'PM' ? <Building2 size={10} /> : <User size={10} />}
                        {clientName(c.client)}
                      </span>
                      {c.categoria?.requiereGPS && (
                        <span className="text-[10px] bg-inyecta-100 text-inyecta-700 px-1.5 py-0.5 rounded font-medium">
                          OBLIGATORIO
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Dispositivo</p>
                        <p className="text-sm text-gray-900">
                          {[d.marca, d.modelo].filter(Boolean).join(' ') || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">No. Serie</p>
                        <p className="text-sm text-gray-900 font-mono">{d.numSerie || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Proveedor</p>
                        <p className="text-sm text-gray-900">{d.proveedor || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Instalado</p>
                        <p className="text-sm text-gray-900">
                          {d.fechaInstalacion ? formatDate(d.fechaInstalacion) : '—'}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-2 truncate">
                      {[c.bienMarca, c.bienModelo, c.bienDescripcion].filter(Boolean).join(' · ')}
                      {d.costoInstalacion && Number(d.costoInstalacion) > 0 && (
                        <span className="ml-3 text-[11px] text-gray-400">
                          Instalación: {formatCurrency(Number(d.costoInstalacion))}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {d.activo && (
                      <button
                        onClick={() => setShowModal({ mode: 'uninstall', device: d })}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 border border-amber-200"
                        title="Retirar dispositivo"
                      >
                        <PowerOff size={12} /> Retirar
                      </button>
                    )}
                    <button
                      onClick={() => setShowModal({ mode: 'edit', device: d })}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
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

      {showModal && (
        <GPSModal
          mode={showModal.mode}
          device={showModal.device}
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
      onClick={onClick} disabled={!onClick}
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
      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>
    </button>
  );
}

// ─── Modal ───────────────────────────────────────────────────
function GPSModal({ mode, device, preselectContractId, contracts, onClose, onSaved }: {
  mode: 'create' | 'edit' | 'uninstall';
  device?: GPSDevice;
  preselectContractId?: string;
  contracts: Array<{ id: string; folio: string; bienDescripcion: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isUninstall = mode === 'uninstall';
  const isEdit = mode === 'edit';

  const [form, setForm] = useState({
    contractId: device?.contractId || preselectContractId || '',
    marca: device?.marca || '',
    modelo: device?.modelo || '',
    numSerie: device?.numSerie || '',
    proveedor: device?.proveedor || 'GPS Tracker MX',
    fechaInstalacion: device?.fechaInstalacion?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    costoInstalacion: device?.costoInstalacion ? String(device.costoInstalacion) : '3500',
    observaciones: device?.observaciones || '',
  });
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      if (isUninstall && device) {
        await api.post(`/gps/${device.id}/uninstall`, { motivo });
      } else {
        if (!form.contractId) { setError('Selecciona un contrato'); setSaving(false); return; }

        const payload = {
          ...form,
          costoInstalacion: form.costoInstalacion ? Number(form.costoInstalacion) : undefined,
        };
        if (isEdit && device) {
          await api.put(`/gps/${device.id}`, payload);
        } else {
          await api.post('/gps', payload);
        }
      }
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al guardar');
    }
    setSaving(false);
  };

  const title = isUninstall ? 'Retirar dispositivo' : isEdit ? 'Editar dispositivo' : 'Nuevo dispositivo GPS';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapPin size={18} className="text-inyecta-600" />
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

          {isUninstall && device && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="text-amber-800">
                  Vas a marcar como <strong>retirado</strong> el dispositivo <span className="font-mono">{device.numSerie || device.id.slice(0, 8)}</span> del contrato <span className="font-mono font-semibold">{device.contract.folio}</span>.
                </p>
                <p className="text-amber-600 text-xs mt-1">
                  El registro se conserva para trazabilidad. Útil al terminar contratos o reemplazar equipos.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Motivo del retiro</label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Contrato terminado, dispositivo dañado, reemplazo por falla..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none resize-none"
                />
              </div>
            </>
          )}

          {!isUninstall && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Contrato *</label>
                <select
                  value={form.contractId}
                  onChange={(e) => setForm({ ...form, contractId: e.target.value })}
                  disabled={isEdit}
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
                <Field label="Marca" value={form.marca} onChange={v => setForm({ ...form, marca: v })} placeholder="Queclink, Concox..." />
                <Field label="Modelo" value={form.modelo} onChange={v => setForm({ ...form, modelo: v })} placeholder="GV75, GT06N..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Número de serie" value={form.numSerie} onChange={v => setForm({ ...form, numSerie: v })} mono placeholder="IMEI / IMSI" />
                <Field label="Proveedor" value={form.proveedor} onChange={v => setForm({ ...form, proveedor: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha de instalación" value={form.fechaInstalacion} onChange={v => setForm({ ...form, fechaInstalacion: v })} type="date" />
                <Field label="Costo instalación (MXN)" value={form.costoInstalacion} onChange={v => setForm({ ...form, costoInstalacion: v })} type="number" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Observaciones</label>
                <textarea
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  rows={2}
                  placeholder="Ubicación de instalación, plataforma de monitoreo, SIM card, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 ${
              isUninstall ? 'bg-amber-600 hover:bg-amber-700' : 'bg-inyecta-700 hover:bg-inyecta-800'
            }`}
          >
            {saving ? 'Guardando...' : isUninstall ? 'Marcar como retirado' : 'Guardar'}
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
