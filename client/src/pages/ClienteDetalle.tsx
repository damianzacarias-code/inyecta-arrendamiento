import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft, Building2, User, FileCheck, Clock, AlertTriangle,
  CheckCircle2, XCircle, Send, StickyNote, FileText, Eye, ExternalLink,
} from 'lucide-react';

interface Doc {
  id: string;
  tipo: string;
  nombre: string;
  requerido: boolean;
  estado: 'PENDIENTE' | 'RECIBIDO' | 'VENCIDO' | 'RECHAZADO';
  fechaRecepcion?: string;
  fechaVencimiento?: string;
  observaciones?: string;
}

interface Note {
  id: string;
  contenido: string;
  createdAt: string;
  user: { nombre: string; apellidos: string };
}

interface ClientDetail {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  razonSocial?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  calle?: string;
  numExterior?: string;
  colonia?: string;
  municipio?: string;
  ciudad?: string;
  estado?: string;
  cp?: string;
  sector?: string;
  actividadEconomica?: string;
  representanteLegal?: string;
  createdAt: string;
  documentos: Doc[];
  cotizaciones: Array<{ id: string; folio: string; producto: string; valorBien: number; rentaMensualIVA: number; plazo: number; estado: string; createdAt: string }>;
  contratos: Array<{ id: string; folio: string; producto: string; montoFinanciar: number; etapa: string; createdAt: string }>;
  notas: Note[];
}

const tabs = [
  { id: 'docs', label: 'Documentos', icon: FileCheck },
  { id: 'info', label: 'Informacion', icon: User },
  { id: 'operaciones', label: 'Operaciones', icon: FileText },
  { id: 'notas', label: 'Bitacora', icon: StickyNote },
];

const statusConfig = {
  PENDIENTE: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Pendiente' },
  RECIBIDO: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Recibido' },
  VENCIDO: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', label: 'Vencido' },
  RECHAZADO: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Rechazado' },
};

function clientName(c: ClientDetail): string {
  if (c.tipo === 'PM') return c.razonSocial || '';
  return [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ');
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('docs');
  const [updatingDoc, setUpdatingDoc] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [sendingNote, setSendingNote] = useState(false);

  const fetchClient = () => {
    api.get(`/clients/${id}`)
      .then((res) => setClient(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClient(); }, [id]);

  const updateDocStatus = async (docId: string, estado: string) => {
    setUpdatingDoc(docId);
    try {
      await api.put(`/clients/${id}/documents/${docId}`, { estado });
      fetchClient();
    } catch {}
    setUpdatingDoc(null);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSendingNote(true);
    try {
      await api.post(`/clients/${id}/notes`, { contenido: newNote });
      setNewNote('');
      fetchClient();
    } catch {}
    setSendingNote(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-inyecta-600 border-t-transparent" />
    </div>
  );

  if (!client) return (
    <div className="text-center py-20">
      <p className="text-gray-500">Cliente no encontrado</p>
      <Link to="/clientes" className="text-inyecta-600 hover:underline text-sm mt-2 inline-block">Volver</Link>
    </div>
  );

  const totalReq = client.documentos.filter(d => d.requerido).length;
  const recibidosReq = client.documentos.filter(d => d.requerido && d.estado === 'RECIBIDO').length;
  const pct = totalReq > 0 ? Math.round((recibidosReq / totalReq) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/clientes" className="text-gray-400 hover:text-gray-600 mt-1">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                client.tipo === 'PM' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {client.tipo === 'PM' ? <Building2 size={12} /> : <User size={12} />}
                {client.tipo}
              </span>
              <h1 className="text-xl font-bold text-gray-900">{clientName(client)}</h1>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              {client.rfc || 'Sin RFC'} · {client.email || 'Sin email'} · Registrado {formatDate(client.createdAt)}
            </p>
          </div>
        </div>
        <div className="text-right space-y-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Documentos requeridos</div>
            <div className="flex items-center gap-2 justify-end">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">{recibidosReq}/{totalReq}</span>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await api.post(`/portal/regenerate-token/${client.id}`);
                const url = `${window.location.origin}${res.data.portalUrl}`;
                if (navigator.clipboard) {
                  await navigator.clipboard.writeText(url);
                  alert(`Portal del Arrendatario\n\nURL copiada al portapapeles:\n${url}\n\nEnvíela al cliente para que consulte sus contratos, pagos y facturas.`);
                } else {
                  prompt('Copia esta URL para el cliente:', url);
                }
              } catch (err: any) {
                alert('Error: ' + (err?.response?.data?.error || err.message));
              }
            }}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-inyecta-200 text-inyecta-700 rounded-lg hover:bg-inyecta-50"
            title="Generar URL del portal del arrendatario"
          >
            <ExternalLink size={12} /> Generar acceso a Portal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-inyecta-600 text-inyecta-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.id === 'docs' && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {pct}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'docs' && (
        <div className="space-y-2">
          {client.documentos.map((doc) => {
            const st = statusConfig[doc.estado];
            const Icon = st.icon;
            return (
              <div key={doc.id} className={`flex items-center justify-between p-3 rounded-lg border border-gray-200 ${st.bg}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon size={18} className={st.color} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {doc.nombre}
                      {doc.requerido && <span className="text-red-400 ml-1">*</span>}
                    </div>
                    {doc.fechaRecepcion && (
                      <div className="text-xs text-gray-400">Recibido: {formatDate(doc.fechaRecepcion)}</div>
                    )}
                    {doc.observaciones && (
                      <div className="text-xs text-gray-500 mt-0.5">{doc.observaciones}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  {updatingDoc === doc.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-inyecta-600 border-t-transparent" />
                  ) : (
                    <>
                      <button
                        onClick={() => updateDocStatus(doc.id, 'RECIBIDO')}
                        title="Marcar como recibido"
                        className={`p-1.5 rounded hover:bg-emerald-100 transition-colors ${doc.estado === 'RECIBIDO' ? 'bg-emerald-200' : ''}`}
                      >
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      </button>
                      <button
                        onClick={() => updateDocStatus(doc.id, 'PENDIENTE')}
                        title="Marcar como pendiente"
                        className={`p-1.5 rounded hover:bg-amber-100 transition-colors ${doc.estado === 'PENDIENTE' ? 'bg-amber-200' : ''}`}
                      >
                        <Clock size={14} className="text-amber-500" />
                      </button>
                      <button
                        onClick={() => updateDocStatus(doc.id, 'RECHAZADO')}
                        title="Rechazar"
                        className={`p-1.5 rounded hover:bg-red-100 transition-colors ${doc.estado === 'RECHAZADO' ? 'bg-red-200' : ''}`}
                      >
                        <XCircle size={14} className="text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-400 mt-4 text-center">
            * Documentos marcados con asterisco son requeridos por politica
          </p>
        </div>
      )}

      {tab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Datos Generales</h3>
            <div className="space-y-2.5">
              {client.tipo === 'PM' ? (
                <>
                  <InfoRow label="Razon Social" value={client.razonSocial} />
                  <InfoRow label="Rep. Legal" value={client.representanteLegal} />
                </>
              ) : (
                <>
                  <InfoRow label="Nombre" value={[client.nombre, client.apellidoPaterno, client.apellidoMaterno].filter(Boolean).join(' ')} />
                </>
              )}
              <InfoRow label="RFC" value={client.rfc} mono />
              <InfoRow label="Email" value={client.email} />
              <InfoRow label="Telefono" value={client.telefono} />
              <InfoRow label="Sector" value={client.sector} />
              <InfoRow label="Actividad" value={client.actividadEconomica} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Domicilio Fiscal</h3>
            <div className="space-y-2.5">
              <InfoRow label="Calle" value={[client.calle, client.numExterior].filter(Boolean).join(' #')} />
              <InfoRow label="Colonia" value={client.colonia} />
              <InfoRow label="Municipio" value={client.municipio} />
              <InfoRow label="Ciudad" value={client.ciudad} />
              <InfoRow label="Estado" value={client.estado} />
              <InfoRow label="C.P." value={client.cp} />
            </div>
          </div>
        </div>
      )}

      {tab === 'operaciones' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Cotizaciones ({client.cotizaciones.length})</h3>
            {client.cotizaciones.length === 0 ? (
              <p className="text-sm text-gray-400">Sin cotizaciones</p>
            ) : (
              <div className="space-y-2">
                {client.cotizaciones.map((q) => (
                  <Link key={q.id} to={`/cotizaciones/${q.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-inyecta-700">{q.folio}</span>
                      <span className="text-sm text-gray-600">{q.producto}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(Number(q.rentaMensualIVA))}/mes</span>
                      <span className="text-xs text-gray-400">{formatDate(q.createdAt)}</span>
                      <Eye size={14} className="text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Contratos ({client.contratos.length})</h3>
            {client.contratos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin contratos</p>
            ) : (
              <div className="space-y-2">
                {client.contratos.map((c) => (
                  <Link key={c.id} to={`/contratos/${c.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-inyecta-700">{c.folio}</span>
                      <span className="text-sm text-gray-600">{c.producto}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(Number(c.montoFinanciar))}</span>
                      <span className="text-xs bg-inyecta-100 text-inyecta-700 px-2 py-0.5 rounded">{c.etapa}</span>
                      <Eye size={14} className="text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'notas' && (
        <div className="space-y-4">
          {/* New note */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-inyecta-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {user?.nombre?.[0]}{user?.apellidos?.[0]}
              </div>
              <div className="flex-1">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Agregar nota a la bitacora..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={addNote}
                    disabled={!newNote.trim() || sendingNote}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-inyecta-700 text-white rounded-lg text-xs font-medium hover:bg-inyecta-800 disabled:bg-gray-300 transition-colors"
                  >
                    <Send size={12} /> Publicar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Notes list */}
          {client.notas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin notas en la bitacora</p>
          ) : (
            client.notas.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                    {note.user.nombre?.[0]}{note.user.apellidos?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{note.user.nombre} {note.user.apellidos}</span>
                      <span className="text-xs text-gray-400">{formatDate(note.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{note.contenido}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
    </div>
  );
}
