import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  FileText,
  FolderOpen,
  History,
  Receipt,
  StickyNote,
  Target,
  UserPlus,
  CheckSquare,
} from 'lucide-react';
import { apiGet, errorMessage } from '../../lib/api';
import { formatDateTime, formatMoney, formatRelative, label as translate } from '../../lib/format';
import { ErrorState } from '../../components/ui/Spinner';
import { cn } from '../../lib/utils';
import type { TimelineEvent } from '../../types';

const ICONS: Record<string, typeof Activity> = {
  CREACION: UserPlus,
  ACTIVIDAD: Activity,
  OPORTUNIDAD: Target,
  COTIZACION: FileText,
  VENTA: Receipt,
  TAREA: CheckSquare,
  NOTA: StickyNote,
  DOCUMENTO: FolderOpen,
  CAMBIO: History,
};

const TONES: Record<string, string> = {
  CREACION: 'bg-brand-100 text-brand-700',
  ACTIVIDAD: 'bg-sky-100 text-sky-700',
  OPORTUNIDAD: 'bg-violet-100 text-violet-700',
  COTIZACION: 'bg-amber-100 text-amber-700',
  VENTA: 'bg-emerald-100 text-emerald-700',
  TAREA: 'bg-indigo-100 text-indigo-700',
  NOTA: 'bg-slate-100 text-slate-700',
  DOCUMENTO: 'bg-teal-100 text-teal-700',
  CAMBIO: 'bg-slate-100 text-slate-500',
};

const FILTERS = [
  { key: 'TODO', label: 'Todo' },
  { key: 'ACTIVIDAD', label: 'Actividades' },
  { key: 'OPORTUNIDAD', label: 'Oportunidades' },
  { key: 'COTIZACION', label: 'Cotizaciones' },
  { key: 'VENTA', label: 'Ventas' },
  { key: 'TAREA', label: 'Tareas' },
  { key: 'NOTA', label: 'Notas' },
  { key: 'DOCUMENTO', label: 'Documentos' },
  { key: 'CAMBIO', label: 'Cambios' },
];

/** Construye la descripción legible de un evento a partir de sus metadatos. */
function describe(event: TimelineEvent): string | null {
  const meta = (event.meta ?? {}) as Record<string, string | undefined>;
  const parts: string[] = [];

  if (meta.amount) parts.push(`Valor estimado ${formatMoney(meta.amount)}`);
  if (meta.total) parts.push(`Total ${formatMoney(meta.total)}`);
  if (meta.status) parts.push(translate(meta.status));
  if (meta.priority) parts.push(`Prioridad ${translate(meta.priority)}`);
  if (meta.category) parts.push(translate(meta.category));

  if (parts.length > 0) return parts.join(' · ');
  return event.description;
}

/** Línea de tiempo cronológica con toda la relación comercial del cliente. */
export function TimelinePanel({ clientId }: { clientId: string }) {
  const [filter, setFilter] = useState('TODO');

  const query = useQuery({
    queryKey: ['client', clientId, 'timeline'],
    queryFn: () => apiGet<TimelineEvent[]>(`/clients/${clientId}/timeline`),
  });

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const events = (query.data ?? []).filter((event) => filter === 'TODO' || event.kind === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              filter === item.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {query.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-14 w-full" />
          ))}
        </div>
      )}

      {!query.isLoading && events.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          No hay eventos registrados para este filtro.
        </p>
      )}

      <ol className="relative space-y-1 border-l border-slate-200 pl-6">
        {events.map((event) => {
          const Icon = ICONS[event.kind] ?? History;
          return (
            <li key={event.id} className="relative pb-4">
              <span
                className={cn(
                  'absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white',
                  TONES[event.kind] ?? 'bg-slate-100 text-slate-600',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{event.title}</p>
                  <p className="text-xs text-slate-400" title={formatDateTime(event.occurredAt)}>
                    {formatRelative(event.occurredAt)}
                  </p>
                </div>
                {describe(event) && (
                  <p className="mt-0.5 line-clamp-3 text-xs text-slate-500">{describe(event)}</p>
                )}
                {event.actor && <p className="mt-1 text-[11px] text-slate-400">Registrado por {event.actor}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
