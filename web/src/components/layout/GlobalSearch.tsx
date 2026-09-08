import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useDebounced } from '../../hooks/useDebounced';
import { StatusBadge } from '../ui/Badge';
import type { SearchGroup } from '../../types';

export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounced = useDebounced(term, 300);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => apiGet<{ total: number; groups: SearchGroup[] }>('/search', { q: debounced }),
    enabled: debounced.trim().length >= 2,
  });

  // Atajo de teclado: Ctrl/Cmd + K abre la búsqueda global.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (link: string) => {
    setOpen(false);
    setTerm('');
    navigate(link);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar clientes, prospectos, oportunidades…"
          aria-label="Búsqueda global"
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-16 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {term ? (
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">
            Ctrl K
          </kbd>
        )}
      </div>

      {open && debounced.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {isFetching && <p className="px-3 py-4 text-sm text-slate-500">Buscando…</p>}
          {!isFetching && (data?.total ?? 0) === 0 && (
            <p className="px-3 py-4 text-sm text-slate-500">
              Sin resultados para “{debounced}”.
            </p>
          )}
          {data?.groups.map((group) => (
            <div key={group.type} className="mb-1 last:mb-0">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={`${group.type}-${item.id}`}
                  type="button"
                  onClick={() => go(item.link)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                    {item.subtitle && (
                      <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                    )}
                  </span>
                  {item.badge && <StatusBadge value={item.badge} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
