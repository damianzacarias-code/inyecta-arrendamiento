import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Banknote, Upload, FileText, CheckCircle2, AlertTriangle,
  Trash2, Sparkles, Link2, Unlink, Building2, ArrowRight,
} from 'lucide-react';

interface Statement {
  id: string;
  banco: string;
  fileName: string;
  fechaInicio: string;
  fechaFin: string;
  totalAbonos: number;
  totalCargos: number;
  transacciones: number;
  createdAt: string;
}

interface Transaction {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  monto: number;
  tipo: 'ABONO' | 'CARGO';
  matched: boolean;
  paymentId: string | null;
  matchScore: number | null;
}

interface Suggestion {
  transactionId: string;
  fecha: string;
  monto: number;
  descripcion: string;
  bestMatch: {
    contractId: string;
    contractFolio: string;
    clienteNombre: string;
    periodo: number | null;
    montoEsperado: number;
    diasDiferencia: number;
    score: number;
    razones: string[];
  } | null;
}

export default function Conciliacion() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [activo, setActivo] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statementInfo, setStatementInfo] = useState<Statement | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStatements = async () => {
    try {
      const res = await api.get('/conciliation/statements');
      setStatements(res.data.statements);
    } catch { /* noop */ }
  };

  const loadStatement = async (id: string) => {
    setActivo(id);
    setSuggestions([]);
    try {
      const res = await api.get(`/conciliation/statements/${id}`);
      setStatementInfo(res.data);
      setTransactions(res.data.transacciones);
    } catch { /* noop */ }
  };

  useEffect(() => { loadStatements(); }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post('/conciliation/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert(`Estado de cuenta procesado:\n\n${res.data.statement.totalRows} transacciones\nAbonos: ${formatCurrency(res.data.statement.totalAbonos)}\nCargos: ${formatCurrency(res.data.statement.totalCargos)}`);
      await loadStatements();
      loadStatement(res.data.statement.id);
    } catch (err: any) {
      alert('Error: ' + (err?.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAutoMatch = async () => {
    if (!activo) return;
    setAutoMatching(true);
    try {
      const res = await api.post(`/conciliation/auto-match/${activo}`);
      setSuggestions(res.data.suggestions);
      alert(`${res.data.conSugerencia} de ${res.data.total} transacciones tienen sugerencia de match`);
    } catch (err: any) {
      alert('Error: ' + (err?.response?.data?.error || err.message));
    } finally {
      setAutoMatching(false);
    }
  };

  const handleConfirmMatch = async (sug: Suggestion) => {
    if (!sug.bestMatch) return;
    try {
      await api.post('/conciliation/match', {
        transactionId: sug.transactionId,
        contractId: sug.bestMatch.contractId,
        periodo: sug.bestMatch.periodo,
        matchScore: sug.bestMatch.score,
      });
      // Refrescar transacciones y quitar sugerencia
      await loadStatement(activo!);
      setSuggestions(prev => prev.filter(s => s.transactionId !== sug.transactionId));
    } catch (err: any) {
      alert('Error: ' + (err?.response?.data?.error || err.message));
    }
  };

  const handleUnmatch = async (txId: string) => {
    if (!confirm('¿Deshacer la conciliación de esta transacción?')) return;
    try {
      await api.post('/conciliation/unmatch', { transactionId: txId });
      await loadStatement(activo!);
    } catch (err: any) {
      alert('Error: ' + (err?.response?.data?.error || err.message));
    }
  };

  const handleDeleteStatement = async (id: string) => {
    if (!confirm('¿Borrar este estado de cuenta y todas sus transacciones?\n\nLos pagos creados desde la conciliación NO se borran.')) return;
    try {
      await api.delete(`/conciliation/statements/${id}`);
      if (activo === id) { setActivo(null); setTransactions([]); setStatementInfo(null); }
      await loadStatements();
    } catch (err: any) {
      alert('Error: ' + (err?.response?.data?.error || err.message));
    }
  };

  const matchedCount = transactions.filter(t => t.matched).length;
  const abonosCount = transactions.filter(t => t.tipo === 'ABONO').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Banknote className="text-inyecta-600" size={28} />
            Conciliación Bancaria
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sube estados de cuenta CSV y vincula depósitos a contratos
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-inyecta-600 text-white rounded-lg hover:bg-inyecta-700 disabled:opacity-50"
          >
            <Upload size={16} />
            {uploading ? 'Procesando...' : 'Subir CSV'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Lista de estados de cuenta */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase">Estados de cuenta</h2>
          {statements.length === 0 ? (
            <div className="bg-white p-4 rounded-lg border border-dashed border-gray-300 text-center text-sm text-gray-500">
              Aún no has subido ningún estado de cuenta
            </div>
          ) : statements.map(s => (
            <div
              key={s.id}
              className={`bg-white p-3 rounded-lg border cursor-pointer transition-all ${
                activo === s.id ? 'border-inyecta-500 ring-2 ring-inyecta-100' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => loadStatement(s.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1">
                    <Building2 size={12} className="text-gray-400" />
                    {s.banco}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.fileName}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {s.transacciones} transacciones
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDate(s.fechaInicio)} → {formatDate(s.fechaFin)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteStatement(s.id); }}
                  className="text-gray-400 hover:text-red-500 p-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 text-xs">
                <span className="text-green-700">+{formatCurrency(s.totalAbonos)}</span>
                {s.totalCargos > 0 && (
                  <span className="text-red-700 ml-2">−{formatCurrency(s.totalCargos)}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Detalle del estado de cuenta */}
        <div className="lg:col-span-3 space-y-4">
          {!activo ? (
            <div className="bg-white p-12 rounded-lg border border-gray-200 text-center text-gray-500">
              <FileText size={32} className="mx-auto text-gray-300 mb-2" />
              Selecciona un estado de cuenta para ver sus transacciones
            </div>
          ) : (
            <>
              {/* Resumen + acciones */}
              {statementInfo && (
                <div className="bg-white p-4 rounded-lg border border-gray-200 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Conciliados</div>
                      <div className="text-xl font-bold text-green-700">
                        {matchedCount} / {abonosCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Pendientes</div>
                      <div className="text-xl font-bold text-amber-700">
                        {abonosCount - matchedCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Total abonos</div>
                      <div className="text-xl font-bold text-inyecta-700">
                        {formatCurrency(statementInfo.totalAbonos)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleAutoMatch}
                    disabled={autoMatching}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    {autoMatching ? 'Buscando matches...' : 'Auto-conciliar abonos'}
                  </button>
                </div>
              )}

              {/* Sugerencias de match */}
              {suggestions.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-1">
                    <Sparkles size={14} /> Sugerencias automáticas ({suggestions.filter(s => s.bestMatch).length})
                  </h3>
                  <div className="space-y-2">
                    {suggestions.filter(s => s.bestMatch).map(sug => (
                      <div key={sug.transactionId} className="bg-white p-3 rounded border border-purple-200 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-xs text-gray-500">
                              {formatDate(sug.fecha)} · {sug.descripcion.slice(0, 60)}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-semibold">{formatCurrency(sug.monto)}</span>
                              <ArrowRight size={12} className="text-gray-400" />
                              <span className="font-semibold text-inyecta-700">
                                {sug.bestMatch!.contractFolio}
                              </span>
                              <span className="text-xs text-gray-500">
                                · {sug.bestMatch!.clienteNombre}
                              </span>
                              {sug.bestMatch!.periodo && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                  Periodo {sug.bestMatch!.periodo}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                sug.bestMatch!.score >= 80 ? 'bg-green-100 text-green-700' :
                                sug.bestMatch!.score >= 60 ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                Score {sug.bestMatch!.score}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {sug.bestMatch!.razones.join(' · ')}
                            </div>
                          </div>
                          <button
                            onClick={() => handleConfirmMatch(sug)}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 inline-flex items-center gap-1"
                          >
                            <Link2 size={12} /> Conciliar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabla de transacciones */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-left">Referencia</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.fecha)}</td>
                          <td className="px-3 py-2 max-w-md truncate" title={t.descripcion}>
                            {t.descripcion}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 font-mono">{t.referencia || '—'}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                            t.tipo === 'ABONO' ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {t.tipo === 'ABONO' ? '+' : '−'}{formatCurrency(Math.abs(t.monto))}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {t.matched ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                <CheckCircle2 size={10} /> Conciliado
                              </span>
                            ) : t.tipo === 'ABONO' ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                <AlertTriangle size={10} /> Pendiente
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">cargo</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {t.matched && (
                              <button
                                onClick={() => handleUnmatch(t.id)}
                                title="Deshacer conciliación"
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Unlink size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
