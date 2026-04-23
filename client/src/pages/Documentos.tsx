import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  FolderOpen, Search, CheckCircle2, Clock, AlertTriangle, XCircle,
  Building2, User, ChevronDown, ChevronUp, Plus, Edit2, Trash2,
  X, Save, FileCheck, FilePlus, BarChart3, Upload, Paperclip,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

type DocEstado = 'PENDIENTE' | 'RECIBIDO' | 'VENCIDO' | 'RECHAZADO' | 'SIN_REGISTRAR';

interface ClientDoc {
  id: string;
  tipo: string;
  nombre: string;
  requerido: boolean;
  estado: DocEstado;
  archivoUrl?: string;
  fechaRecepcion?: string;
  fechaVencimiento?: string;
  observaciones?: string;
}

interface ClientRow {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre: string;
  rfc?: string;
  contratosActivos: number;
  documentos: {
    total: number; requeridos: number; recibidos: number;
    pendientes: number; vencidos: number; faltantes: number;
  };
  porcentaje: number;
  completo: boolean;
  alertas: number;
}

interface CatalogoDoc { tipo: string; nombre: string; requerido: boolean; }

interface DocModal {
  mode: 'create' | 'edit';
  clientId: string;
  clientTipo: 'PFAE' | 'PM';
  doc?: ClientDoc;
  catalogo: CatalogoDoc[];
}

const estadoConfig: Record<DocEstado, { label: string; color: string; icon: any }> = {
  RECIBIDO:      { label: 'Recibido',      color: 'emerald', icon: CheckCircle2 },
  PENDIENTE:     { label: 'Pendiente',     color: 'amber',   icon: Clock },
  VENCIDO:       { label: 'Vencido',       color: 'red',     icon: AlertTriangle },
  RECHAZADO:     { label: 'Rechazado',     color: 'red',     icon: XCircle },
  SIN_REGISTRAR: { label: 'Sin registrar', color: 'gray',    icon: Clock },
};

const estadoBadge: Record<DocEstado, string> = {
  RECIBIDO:      'bg-emerald-100 text-emerald-700',
  PENDIENTE:     'bg-amber-100 text-amber-700',
  VENCIDO:       'bg-red-100 text-red-600',
  RECHAZADO:     'bg-red-100 text-red-600',
  SIN_REGISTRAR: 'bg-gray-100 text-gray-500',
};

// ─── Component ──────────────────────────────────────────────

export default function Documentos() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'incompletos' | 'completos' | 'alertas'>('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<{ docs: ClientDoc[]; faltantes: CatalogoDoc[]; resumen: any } | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [catalogo, setCatalogo] = useState<{ PFAE: CatalogoDoc[]; PM: CatalogoDoc[] }>({ PFAE: [], PM: [] });
  const [modal, setModal] = useState<DocModal | null>(null);
  const [form, setForm] = useState<Partial<ClientDoc>>({});
  const [saving, setSaving] = useState(false);

  const fetchDashboard = () => {
    setLoading(true);
    api.get('/documents').then(r => {
      setClients(r.data.data);
      setSummary(r.data.summary);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard();
    api.get('/documents/catalogo').then(r => setCatalogo(r.data));
  }, []);

  const loadClientDocs = async (clientId: string) => {
    if (expandedId === clientId) { setExpandedId(null); setExpandedDocs(null); return; }
    setExpandedId(clientId);
    setExpandedDocs(null);
    setLoadingDocs(true);
    try {
      const r = await api.get(`/documents?clientId=${clientId}`);
      setExpandedDocs({ docs: r.data.documentos, faltantes: r.data.faltantes, resumen: r.data.resumen });
    } finally {
      setLoadingDocs(false);
    }
  };

  const initChecklist = async (clientId: string) => {
    await api.post('/documents/init-checklist', { clientId });
    const r = await api.get(`/documents?clientId=${clientId}`);
    setExpandedDocs({ docs: r.data.documentos, faltantes: r.data.faltantes, resumen: r.data.resumen });
    fetchDashboard();
  };

  const openCreate = (clientId: string, clientTipo: 'PFAE' | 'PM', doc?: CatalogoDoc) => {
    const cat = clientTipo === 'PM' ? catalogo.PM : catalogo.PFAE;
    setModal({ mode: 'create', clientId, clientTipo, catalogo: cat });
    setForm({
      tipo: doc?.tipo || '',
      nombre: doc?.nombre || '',
      requerido: doc?.requerido ?? true,
      estado: 'PENDIENTE',
    });
  };

  const openEdit = (clientId: string, clientTipo: 'PFAE' | 'PM', doc: ClientDoc) => {
    const cat = clientTipo === 'PM' ? catalogo.PM : catalogo.PFAE;
    setModal({ mode: 'edit', clientId, clientTipo, doc, catalogo: cat });
    setForm({ ...doc });
  };

  const handleUpload = async (docId: string, clientId: string, file: File, fechaVencimiento?: string) => {
    const fd = new FormData();
    fd.append('archivo', file);
    if (fechaVencimiento) fd.append('fechaVencimiento', fechaVencimiento);
    try {
      await api.post(`/documents/${docId}/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const r = await api.get(`/documents?clientId=${clientId}`);
      setExpandedDocs({ docs: r.data.documentos, faltantes: r.data.faltantes, resumen: r.data.resumen });
      fetchDashboard();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al subir el archivo');
    }
  };

  const handleSave = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await api.post('/documents', { ...form, clientId: modal.clientId });
      } else if (modal.doc) {
        await api.put(`/documents/${modal.doc.id}`, form);
      }
      const r = await api.get(`/documents?clientId=${modal.clientId}`);
      setExpandedDocs({ docs: r.data.documentos, faltantes: r.data.faltantes, resumen: r.data.resumen });
      fetchDashboard();
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string, clientId: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    await api.delete(`/documents/${docId}`);
    const r = await api.get(`/documents?clientId=${clientId}`);
    setExpandedDocs({ docs: r.data.documentos, faltantes: r.data.faltantes, resumen: r.data.resumen });
    fetchDashboard();
  };

  const filtered = clients.filter(c => {
    const matchSearch = !search ||
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (c.rfc || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'todos' ? true :
      filter === 'completos' ? c.completo :
      filter === 'incompletos' ? !c.completo :
      filter === 'alertas' ? c.alertas > 0 : true;
    return matchSearch && matchFilter;
  });

  const onTipoChange = (tipo: string) => {
    const cat = modal?.clientTipo === 'PM' ? catalogo.PM : catalogo.PFAE;
    const found = cat.find(c => c.tipo === tipo);
    setForm(f => ({ ...f, tipo, nombre: found?.nombre || f.nombre, requerido: found?.requerido ?? f.requerido }));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="text-inyecta-600" size={24} />
            Administrador de Documentos
          </h1>
          <p className="text-gray-500 text-sm mt-1">Expediente digital por cliente · Checklist de documentación requerida</p>
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Expedientes completos', val: summary.expedientesCompletos, icon: <FileCheck size={16} className="text-emerald-500" />, color: 'emerald' },
            { label: 'Incompletos', val: summary.expedientesIncompletos, icon: <FilePlus size={16} className="text-amber-500" />, color: 'amber' },
            { label: 'Con alertas', val: summary.totalAlertas, icon: <AlertTriangle size={16} className="text-red-500" />, color: 'red' },
            { label: 'Completitud global', val: `${summary.porcentajeGlobal}%`, icon: <BarChart3 size={16} className="text-inyecta-500" />, color: 'inyecta' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
              <p className="text-2xl font-bold text-gray-900">{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente o RFC..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(['todos', 'alertas', 'incompletos', 'completos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-inyecta-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'alertas' ? 'Con alertas' : f === 'incompletos' ? 'Incompletos' : 'Completos'}
            </button>
          ))}
        </div>
      </div>

      {/* Client list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-inyecta-600 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FolderOpen className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="text-gray-500">No se encontraron clientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isExpanded = expandedId === c.id;
            const pct = Math.min(100, c.porcentaje);
            const barColor = c.completo ? 'bg-emerald-500' : c.alertas > 0 ? 'bg-red-400' : 'bg-amber-400';
            const clientTipo = c.tipo as 'PFAE' | 'PM';

            return (
              <div key={c.id} className={`bg-white rounded-xl border transition-colors ${
                c.alertas > 0 ? 'border-red-200' : c.completo ? 'border-emerald-200' : 'border-gray-200'
              }`}>
                {/* Row */}
                <button
                  className="w-full p-4 text-left hover:bg-gray-50/50 rounded-xl transition-colors"
                  onClick={() => loadClientDocs(c.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      c.tipo === 'PM' ? 'bg-violet-100' : 'bg-cyan-100'
                    }`}>
                      {c.tipo === 'PM' ? <Building2 size={16} className="text-violet-600" /> : <User size={16} className="text-cyan-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{c.nombre}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.tipo === 'PM' ? 'bg-violet-100 text-violet-700' : 'bg-cyan-100 text-cyan-700'}`}>
                          {c.tipo}
                        </span>
                        {c.rfc && <span className="text-xs text-gray-400 font-mono">{c.rfc}</span>}
                        {c.contratosActivos > 0 && (
                          <span className="text-[10px] bg-inyecta-100 text-inyecta-700 px-1.5 py-0.5 rounded">
                            {c.contratosActivos} contrato{c.contratosActivos > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex-1 max-w-[200px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">
                          {c.documentos.recibidos}/{c.documentos.requeridos} requeridos
                        </span>
                        {c.alertas > 0 && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                            {c.alertas} alerta{c.alertas > 1 ? 's' : ''}
                          </span>
                        )}
                        {c.completo && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                            ✓ Completo
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-700">{pct}%</span>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </div>
                </button>

                {/* Expanded docs */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4">
                    {loadingDocs ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-inyecta-600 border-t-transparent" />
                      </div>
                    ) : expandedDocs ? (
                      <>
                        {/* Actions */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span className="text-emerald-600 font-medium">{expandedDocs.resumen.recibidos} recibidos</span>
                            <span className="text-amber-600 font-medium">{expandedDocs.resumen.pendientes} pendientes</span>
                            {expandedDocs.resumen.vencidos > 0 && <span className="text-red-500 font-medium">{expandedDocs.resumen.vencidos} vencidos</span>}
                            {expandedDocs.resumen.sinRegistrar > 0 && <span className="text-gray-400">{expandedDocs.resumen.sinRegistrar} sin registrar</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {expandedDocs.docs.length === 0 && (
                              <button
                                onClick={() => initChecklist(c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-inyecta-50 border border-inyecta-200 text-inyecta-700 rounded-lg text-xs font-medium hover:bg-inyecta-100 transition-colors"
                              >
                                <FilePlus size={12} /> Inicializar checklist
                              </button>
                            )}
                            <button
                              onClick={() => openCreate(c.id, clientTipo)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-inyecta-700 text-white rounded-lg text-xs font-medium hover:bg-inyecta-800 transition-colors"
                            >
                              <Plus size={12} /> Agregar
                            </button>
                          </div>
                        </div>

                        {/* Document grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {expandedDocs.docs.map(doc => {
                            const ec = estadoConfig[doc.estado];
                            const EcIcon = ec.icon;
                            return (
                              <div key={doc.id} className={`border rounded-lg p-3 flex items-start gap-2 ${
                                doc.estado === 'RECIBIDO' ? 'border-emerald-200 bg-emerald-50/30' :
                                doc.estado === 'VENCIDO' || doc.estado === 'RECHAZADO' ? 'border-red-200 bg-red-50/20' :
                                'border-gray-200'
                              }`}>
                                <EcIcon size={14} className={`mt-0.5 flex-shrink-0 text-${ec.color}-500`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-1">
                                    <p className="text-xs font-medium text-gray-800 leading-tight">{doc.nombre}</p>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <label className="text-gray-400 hover:text-inyecta-600 cursor-pointer" title="Subir archivo">
                                        <Upload size={11} />
                                        <input
                                          type="file"
                                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                                          className="hidden"
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            const venc = prompt('Fecha de vencimiento (YYYY-MM-DD, opcional):') || undefined;
                                            handleUpload(doc.id, c.id, f, venc);
                                            e.target.value = '';
                                          }}
                                        />
                                      </label>
                                      {doc.archivoUrl && (
                                        <a
                                          href={`${(api.defaults.baseURL || '').replace(/\/api$/, '')}${doc.archivoUrl}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-emerald-500 hover:text-emerald-700"
                                          title="Ver archivo"
                                        >
                                          <Paperclip size={11} />
                                        </a>
                                      )}
                                      <button onClick={() => openEdit(c.id, clientTipo, doc)} className="text-gray-400 hover:text-inyecta-600">
                                        <Edit2 size={11} />
                                      </button>
                                      <button onClick={() => handleDelete(doc.id, c.id)} className="text-gray-400 hover:text-red-500">
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${estadoBadge[doc.estado]}`}>
                                      {ec.label}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      doc.requerido
                                        ? 'bg-red-50 text-red-600 border border-red-100'
                                        : 'bg-gray-50 text-gray-500 border border-gray-200'
                                    }`}>
                                      {doc.requerido ? 'Requerido' : 'Opcional'}
                                    </span>
                                    {doc.fechaRecepcion && (
                                      <span className="text-[10px] text-gray-400">{formatDate(doc.fechaRecepcion)}</span>
                                    )}
                                    {doc.fechaVencimiento && (() => {
                                      const v = new Date(doc.fechaVencimiento);
                                      const dias = Math.floor((v.getTime() - Date.now()) / 86400000);
                                      if (dias < 0) return <span className="text-[10px] text-red-600 font-semibold">Venció: {formatDate(doc.fechaVencimiento)}</span>;
                                      if (dias <= 30) return <span className="text-[10px] text-amber-600 font-semibold">Vence en {dias}d: {formatDate(doc.fechaVencimiento)}</span>;
                                      return <span className="text-[10px] text-gray-400">Vence: {formatDate(doc.fechaVencimiento)}</span>;
                                    })()}
                                  </div>
                                  {doc.observaciones && (
                                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{doc.observaciones}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Faltantes sin registrar */}
                          {expandedDocs.faltantes.map(f => (
                            <button
                              key={f.tipo}
                              onClick={() => openCreate(c.id, clientTipo, f)}
                              className="border border-dashed border-gray-300 rounded-lg p-3 flex items-center gap-2 hover:border-inyecta-300 hover:bg-inyecta-50/20 transition-colors text-left"
                            >
                              <Plus size={13} className="text-gray-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-500 leading-tight">{f.nombre}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-block mt-1 ${
                                  f.requerido
                                    ? 'bg-red-50 text-red-600 border border-red-100'
                                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                                }`}>
                                  {f.requerido ? 'Requerido' : 'Opcional'}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Link to client */}
                        <div className="mt-3 text-right">
                          <Link to={`/clientes/${c.id}`} className="text-xs text-inyecta-600 hover:underline">
                            Ver expediente completo →
                          </Link>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Document Modal ──────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 text-lg">
                {modal.mode === 'create' ? 'Registrar Documento' : 'Editar Documento'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {/* Tipo selector */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Tipo de documento</label>
                <select
                  value={form.tipo || ''}
                  onChange={e => onTipoChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none"
                >
                  <option value="">Seleccionar tipo...</option>
                  {modal.catalogo.map(c => (
                    <option key={c.tipo} value={c.tipo}>{c.nombre}</option>
                  ))}
                  <option value="OTRO">Otro</option>
                </select>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nombre descriptivo</label>
                <input
                  value={form.nombre || ''}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: INE del representante legal"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Estado */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Estado</label>
                  <select
                    value={form.estado || 'PENDIENTE'}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value as DocEstado }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none"
                  >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="RECIBIDO">Recibido</option>
                    <option value="VENCIDO">Vencido</option>
                    <option value="RECHAZADO">Rechazado</option>
                  </select>
                </div>

                {/* Requerido */}
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.requerido ?? true}
                      onChange={e => setForm(f => ({ ...f, requerido: e.target.checked }))}
                      className="rounded border-gray-300 text-inyecta-600 focus:ring-inyecta-500"
                    />
                    <span className="text-sm text-gray-600">Requerido</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Fecha recepción */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Fecha de recepción</label>
                  <input
                    type="date"
                    value={form.fechaRecepcion ? form.fechaRecepcion.slice(0, 10) : ''}
                    onChange={e => setForm(f => ({ ...f, fechaRecepcion: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none"
                  />
                </div>
                {/* Fecha vencimiento */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Vencimiento (si aplica)</label>
                  <input
                    type="date"
                    value={form.fechaVencimiento ? form.fechaVencimiento.slice(0, 10) : ''}
                    onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none"
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                <textarea
                  value={form.observaciones || ''}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                  rows={2}
                  placeholder="Notas sobre el documento..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end mt-4">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.tipo || !form.nombre}
                className="flex items-center gap-1.5 px-4 py-2 bg-inyecta-700 text-white rounded-lg text-sm font-medium hover:bg-inyecta-800 disabled:bg-gray-300 transition-colors"
              >
                {saving ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> : <Save size={14} />}
                {modal.mode === 'create' ? 'Registrar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
