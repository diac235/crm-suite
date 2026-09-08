import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Clave de ordenamiento aceptada por la API. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  hideOnMobile?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'Sin resultados',
  emptyMessage = 'No se encontraron registros con los filtros aplicados.',
  emptyAction,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: DataTableProps<T>) {
  const selectable = Boolean(onToggleSelect);
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds?.has(rowKey(row)));

  return (
    <div className="table-wrapper">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {selectable && (
              <th scope="col" className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todo"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
            )}
            {columns.map((column) => {
              const sortable = Boolean(column.sortKey && onSort);
              const active = column.sortKey && sortBy === column.sortKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    !column.align && 'text-left',
                    column.hideOnMobile && 'hidden lg:table-cell',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort!(column.sortKey!)}
                      className={cn(
                        'inline-flex items-center gap-1 transition hover:text-slate-900',
                        column.align === 'right' && 'flex-row-reverse',
                        active && 'text-brand-600',
                      )}
                    >
                      {column.header}
                      {active ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading &&
            Array.from({ length: 6 }).map((_, index) => (
              <tr key={`skeleton-${index}`}>
                {selectable && (
                  <td className="px-3 py-3">
                    <div className="skeleton h-4 w-4" />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-3', column.hideOnMobile && 'hidden lg:table-cell')}
                  >
                    <div className="skeleton h-4 w-full max-w-[160px]" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-14">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Inbox className="h-9 w-9 text-slate-300" />
                  <p className="font-medium text-slate-700">{emptyTitle}</p>
                  <p className="max-w-sm text-sm text-slate-500">{emptyMessage}</p>
                  {emptyAction && <div className="mt-2">{emptyAction}</div>}
                </div>
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row) => {
              const id = rowKey(row);
              const selected = selectedIds?.has(id);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition',
                    onRowClick && 'cursor-pointer',
                    selected ? 'bg-brand-50/60' : 'hover:bg-slate-50',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar fila"
                        checked={Boolean(selected)}
                        onChange={() => onToggleSelect!(id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 text-slate-700',
                        column.align === 'right' && 'text-right',
                        column.align === 'center' && 'text-center',
                        column.hideOnMobile && 'hidden lg:table-cell',
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
