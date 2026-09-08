import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { apiGet, errorMessage } from '../lib/api';
import { formatDateTime, formatTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { ErrorState, Spinner } from '../components/ui/Spinner';
import { ActivityFormModal } from '../features/activities/ActivityFormModal';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import type { CalendarEvent } from '../types';

type ViewMode = 'dia' | 'semana' | 'mes';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [view, setView] = useState<ViewMode>('mes');
  const [cursor, setCursor] = useState(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const range = useMemo(() => {
    if (view === 'dia') {
      const from = new Date(cursor);
      from.setHours(0, 0, 0, 0);
      return { from, to: addDays(from, 1) };
    }
    if (view === 'semana') {
      const from = startOfWeek(cursor);
      return { from, to: addDays(from, 7) };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const from = startOfWeek(first);
    return { from, to: addDays(from, 42) };
  }, [view, cursor]);

  const query = useQuery({
    queryKey: ['calendar', range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      apiGet<CalendarEvent[]>('/activities/calendar', {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        includeTasks: true,
      }),
  });

  const events = query.data ?? [];

  const move = (direction: number) => {
    if (view === 'dia') setCursor(addDays(cursor, direction));
    else if (view === 'semana') setCursor(addDays(cursor, direction * 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1));
  };

  const title =
    view === 'dia'
      ? cursor.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'semana'
        ? `${range.from.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })} – ${addDays(range.from, 6).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}`
        : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const eventsOf = (day: Date) => events.filter((event) => sameDay(new Date(event.start), day));

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Reuniones, llamadas, seguimientos y tareas programadas."
        actions={
          <>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
              {(['dia', 'semana', 'mes'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition',
                    view === mode ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {mode === 'dia' ? 'Día' : mode}
                </button>
              ))}
            </div>
            {can('activities.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setSelectedDay(new Date());
                  setFormOpen(true);
                }}
              >
                Nueva actividad
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Siguiente" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              Hoy
            </Button>
          </div>
          <h2 className="text-sm font-semibold capitalize text-slate-800">{title}</h2>
          {query.isFetching ? <Spinner className="h-4 w-4" /> : <span className="w-4" />}
        </div>

        <CardBody className="p-0">
          {view === 'mes' && (
            <div className="grid grid-cols-7 border-t border-slate-200">
              {WEEKDAYS.map((day) => (
                <div key={day} className="border-b border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold text-slate-500">
                  {day}
                </div>
              ))}
              {Array.from({ length: 42 }).map((_, index) => {
                const day = addDays(range.from, index);
                const outside = day.getMonth() !== cursor.getMonth();
                const today = sameDay(day, new Date());
                const dayEvents = eventsOf(day);
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      if (!can('activities.create')) return;
                      setSelectedDay(day);
                      setFormOpen(true);
                    }}
                    className={cn(
                      'min-h-[104px] border-b border-r border-slate-100 p-1.5 text-left align-top transition hover:bg-slate-50',
                      outside && 'bg-slate-50/60 text-slate-400',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        today ? 'bg-brand-600 text-white' : 'text-slate-600',
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span
                          key={`${event.kind}-${event.id}`}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            navigate(event.link);
                          }}
                          className="block truncate rounded px-1.5 py-0.5 text-[11px] text-white"
                          style={{ background: event.color }}
                          title={`${formatTime(event.start)} · ${event.title}`}
                        >
                          {formatTime(event.start)} {event.title}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="block text-[11px] text-slate-400">+{dayEvents.length - 3} más</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === 'semana' && (
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-7 sm:divide-x sm:divide-y-0">
              {Array.from({ length: 7 }).map((_, index) => {
                const day = addDays(range.from, index);
                const dayEvents = eventsOf(day);
                return (
                  <div key={index} className="min-h-[220px] p-2">
                    <p className={cn('mb-2 text-xs font-semibold', sameDay(day, new Date()) ? 'text-brand-600' : 'text-slate-500')}>
                      {WEEKDAYS[index]} {day.getDate()}
                    </p>
                    <div className="space-y-1.5">
                      {dayEvents.map((event) => (
                        <button
                          key={`${event.kind}-${event.id}`}
                          type="button"
                          onClick={() => navigate(event.link)}
                          className="block w-full rounded-lg border-l-4 bg-slate-50 p-2 text-left transition hover:bg-slate-100"
                          style={{ borderColor: event.color }}
                        >
                          <p className="truncate text-xs font-medium text-slate-800">{event.title}</p>
                          <p className="text-[11px] text-slate-500">{formatTime(event.start)}</p>
                        </button>
                      ))}
                      {dayEvents.length === 0 && <p className="text-[11px] text-slate-300">Sin eventos</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'dia' && (
            <ul className="divide-y divide-slate-100">
              {eventsOf(cursor).length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-slate-500">No hay eventos programados para este día.</li>
              )}
              {eventsOf(cursor).map((event) => (
                <li key={`${event.kind}-${event.id}`}>
                  <button
                    type="button"
                    onClick={() => navigate(event.link)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="h-10 w-1 rounded-full" style={{ background: event.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{event.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {event.clientName ?? 'Sin cliente'} · {event.ownerName ?? 'Sin responsable'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatDateTime(event.start)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ActivityFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        defaults={{ scheduledAt: (selectedDay ?? new Date()).toISOString() }}
      />
    </>
  );
}
