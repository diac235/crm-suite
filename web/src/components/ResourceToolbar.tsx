import type { ReactNode } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

/** Barra superior de las tablas: búsqueda, filtros y acciones. */
export function ResourceToolbar({
  search,
  onSearchChange,
  placeholder = 'Buscar…',
  filters,
  activeFilterCount = 0,
  onResetFilters,
  actions,
  selectionInfo,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  filters?: ReactNode;
  activeFilterCount?: number;
  onResetFilters?: () => void;
  actions?: ReactNode;
  selectionInfo?: ReactNode;
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="input-base h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      {filters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <span className="inline-flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </span>
          {filters}
          {activeFilterCount > 0 && onResetFilters && (
            <Button variant="ghost" size="sm" onClick={onResetFilters} icon={<X className="h-3.5 w-3.5" />}>
              Limpiar ({activeFilterCount})
            </Button>
          )}
        </div>
      )}

      {selectionInfo && (
        <div className={cn('flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800')}>
          {selectionInfo}
        </div>
      )}
    </div>
  );
}

/** Select compacto usado dentro de la barra de filtros. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        aria-label={label}
        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <option value="">{label}: todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
