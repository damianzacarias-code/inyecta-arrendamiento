// Selector de cliente para el wizard Nueva Operación.
//
// Carga /api/clients?limit=200 (paginación simple; suficiente para la
// base actual) y permite buscar por razón social / nombre / RFC. El
// clientId se guarda en el form via setValue('clientId', id).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormContext } from 'react-hook-form';
import { Building2, Search, User } from 'lucide-react';
import api from '@/lib/api';

export interface ClientOption {
  id: string;
  tipo: 'PFAE' | 'PM';
  nombre?: string | null;
  apellidoPaterno?: string | null;
  razonSocial?: string | null;
  rfc?: string | null;
}

function displayName(c: ClientOption): string {
  if (c.tipo === 'PM') return c.razonSocial || 'Sin nombre';
  return (
    [c.nombre, c.apellidoPaterno].filter(Boolean).join(' ') || 'Sin nombre'
  );
}

interface Props {
  /** Cliente seleccionado actual (si lo hay). Se sincroniza al cargar
   *  el wizard con un `clientId` inicial (p. ej. venido del queryparam). */
  selected: ClientOption | null;
  onSelect: (c: ClientOption | null) => void;
}

export function ClienteSelector({ selected, onSelect }: Props) {
  const { formState } = useFormContext();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  // Inicia en true: el loading nace vivo y sólo se apaga cuando la
  // promise resuelve. Así evitamos setState síncrono dentro del effect.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/clients?limit=200')
      .then((res) => {
        if (!cancelled) setClients(res.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        displayName(c).toLowerCase().includes(q) ||
        (c.rfc ?? '').toLowerCase().includes(q),
    );
  }, [clients, search]);

  const err = formState.errors.clientId;
  const errMsg = typeof err?.message === 'string' ? err.message : undefined;

  if (selected) {
    return (
      <div>
        <div className="flex items-center justify-between p-3 rounded-lg border-2 border-inyecta-200 bg-inyecta-50">
          <div className="flex items-center gap-3">
            <div
              className={
                'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs ' +
                (selected.tipo === 'PM' ? 'bg-blue-500' : 'bg-emerald-500')
              }
            >
              {selected.tipo === 'PM' ? (
                <Building2 size={14} />
              ) : (
                <User size={14} />
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">
                {displayName(selected)}
              </p>
              <p className="text-xs text-gray-500">
                {selected.rfc || 'Sin RFC'} · {selected.tipo}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Buscar cliente por nombre o RFC..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className={
            'w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none ' +
            (errMsg ? 'border-red-400' : 'border-gray-300')
          }
        />
        {showDropdown && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-sm text-gray-400 text-center">
                Cargando clientes…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-400 text-center">
                Sin resultados.{' '}
                <Link
                  to="/clientes/nuevo"
                  className="text-inyecta-600 hover:underline"
                >
                  Crear cliente
                </Link>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    setShowDropdown(false);
                    setSearch('');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                >
                  {c.tipo === 'PM' ? (
                    <Building2 size={12} className="text-blue-400" />
                  ) : (
                    <User size={12} className="text-emerald-400" />
                  )}
                  <span className="text-sm text-gray-900">
                    {displayName(c)}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto font-mono">
                    {c.rfc || ''}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {errMsg && <p className="mt-1 text-xs text-red-600">{errMsg}</p>}
    </div>
  );
}
