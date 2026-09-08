import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  delta?: number | null;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  onClick?: () => void;
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-sky-50 text-sky-600',
  neutral: 'bg-slate-100 text-slate-600',
};

export function StatCard({ label, value, icon, hint, delta, tone = 'brand', onClick }: StatCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'card w-full p-4 text-left transition',
        onClick && 'cursor-pointer hover:border-brand-300 hover:shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-slate-500">{label}</p>
          <p className="mt-1 break-words text-2xl font-semibold leading-tight tracking-tight text-slate-900">{value}</p>
          {(hint || delta !== undefined) && (
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              {delta !== undefined && delta !== null && Number.isFinite(delta) && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-medium',
                    delta >= 0 ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
              {hint && <span className="text-slate-400">{hint}</span>}
            </div>
          )}
        </div>
        {icon && (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
            {icon}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
