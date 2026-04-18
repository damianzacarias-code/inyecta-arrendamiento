/**
 * CommandPalette — Búsqueda Global Cmd+K
 *
 * Atajo: ⌘K (Mac) / Ctrl+K (Windows/Linux)
 *
 * Hace fetch debounced a /api/search?q= y muestra resultados agrupados
 * por tipo (clientes / contratos / cotizaciones / facturas).
 * Navegable con flechas y Enter.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import {
  Search,
  Users,
  FolderOpen,
  FileText,
  Receipt,
  Loader2,
  X,
} from 'lucide-react';

type ResultKind = 'cliente' | 'contrato' | 'cotizacion' | 'factura';

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  badge?: string;
}

const KIND_META: Record<ResultKind, { label: string; icon: typeof Users; color: string }> = {
  cliente:    { label: 'Clientes',     icon: Users,      color: 'text-blue-600 bg-blue-50' },
  contrato:   { label: 'Contratos',    icon: FolderOpen, color: 'text-purple-600 bg-purple-50' },
  cotizacion: { label: 'Cotizaciones', icon: FileText,   color: 'text-amber-600 bg-amber-50' },
  factura:    { label: 'Facturas',     icon: Receipt,    color: 'text-emerald-600 bg-emerald-50' },
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Hotkey ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setActiveIdx(0);
    } else {
      setQ('');
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(q)}&limit=8`);
        setResults(res.data.results || []);
        setActiveIdx(0);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      navigate(r.url);
    },
    [navigate]
  );

  // Navegación con teclado dentro del modal
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) go(results[activeIdx]);
    }
  };

  if (!open) return null;

  // Agrupar por kind manteniendo orden
  const grouped: Record<string, { result: SearchResult; idx: number }[]> = {};
  results.forEach((r, idx) => {
    if (!grouped[r.kind]) grouped[r.kind] = [];
    grouped[r.kind].push({ result: r, idx });
  });

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar clientes, contratos, cotizaciones, facturas..."
            className="flex-1 outline-none text-sm placeholder-gray-400"
          />
          {loading && <Loader2 size={16} className="animate-spin text-gray-400" />}
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {q.trim().length < 2 && (
            <div className="px-4 py-12 text-center text-sm text-gray-400">
              Escribe al menos 2 caracteres para buscar
            </div>
          )}
          {q.trim().length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-gray-400">
              Sin resultados para "{q}"
            </div>
          )}

          {Object.entries(grouped).map(([kind, items]) => {
            const meta = KIND_META[kind as ResultKind];
            const Icon = meta.icon;
            return (
              <div key={kind}>
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                  {meta.label}
                </div>
                {items.map(({ result, idx }) => (
                  <button
                    key={`${kind}-${result.id}`}
                    onClick={() => go(result)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      idx === activeIdx ? 'bg-inyecta-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.color}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {result.title}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{result.subtitle}</div>
                    </div>
                    {result.badge && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide shrink-0">
                        {result.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between text-[11px] text-gray-400 bg-gray-50">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↑↓</kbd>{' '}
              navegar
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↵</kbd>{' '}
              abrir
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]">esc</kbd>{' '}
              cerrar
            </span>
          </div>
          <span className="hidden sm:block">{results.length} resultados</span>
        </div>
      </div>
    </div>
  );
}
