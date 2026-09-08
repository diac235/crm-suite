import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Marco común de los gráficos: el título nombra la serie (por eso una serie
 * única no necesita leyenda), con subtítulo opcional y estado vacío explícito.
 */
export function ChartFrame({
  title,
  subtitle,
  actions,
  isEmpty,
  emptyMessage = 'Sin datos en el período seleccionado.',
  height = 260,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card flex flex-col p-4', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {isEmpty ? (
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </section>
  );
}

interface TooltipRow {
  name: string;
  value: string;
  color?: string;
}

/** Tooltip consistente para todos los gráficos. */
export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-slate-900">{title}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-xs text-slate-600">
          {row.color && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
          )}
          <span>{row.name}:</span>
          <span className="font-medium text-slate-900">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
