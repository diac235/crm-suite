import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '../../lib/api';
import { Button } from './Button';

interface PaginationProps {
  meta?: PageMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50, 100];

export function Pagination({ meta, onPageChange, onPageSizeChange }: PaginationProps) {
  if (!meta) return null;
  const { page, pageSize, total, totalPages } = meta;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 px-1 py-3 sm:flex-row">
      <p className="text-sm text-slate-500">
        Mostrando <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> de{' '}
        <span className="font-medium text-slate-700">{total}</span> registros
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            aria-label="Registros por página"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / página
              </option>
            ))}
          </select>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[80px] text-center text-sm text-slate-600">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
