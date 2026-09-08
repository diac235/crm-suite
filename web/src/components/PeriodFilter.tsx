import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { cn } from '../lib/utils';

export type PeriodKey = 'hoy' | 'semana' | 'mes' | 'trimestre' | 'anio' | 'personalizado';

export interface PeriodValue {
  period: PeriodKey;
  from?: string;
  to?: string;
}

const OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'anio', label: 'Este año' },
  { key: 'personalizado', label: 'Personalizado' },
];

/** Selector de período compartido por dashboard y reportes. */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
}) {
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange({ period: option.key, from, to })}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
              value.period === option.key
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {value.period === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 w-auto"
            aria-label="Desde"
          />
          <span className="text-sm text-slate-400">–</span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 w-auto"
            aria-label="Hasta"
          />
          <Button
            size="sm"
            variant="outline"
            icon={<CalendarRange className="h-4 w-4" />}
            disabled={!from || !to}
            onClick={() => onChange({ period: 'personalizado', from, to })}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}
