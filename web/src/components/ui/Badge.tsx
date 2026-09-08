import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { label as translate } from '../../lib/format';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

/** Correspondencia entre estados del dominio y el color del distintivo. */
const STATUS_TONES: Record<string, Tone> = {
  ACTIVO: 'success',
  INACTIVO: 'neutral',
  ARCHIVADO: 'neutral',
  POTENCIAL: 'info',
  NUEVO: 'info',
  CONTACTADO: 'info',
  CALIFICADO: 'brand',
  EN_NEGOCIACION: 'warning',
  CONVERTIDO: 'success',
  PERDIDO: 'danger',
  FRIO: 'info',
  TIBIO: 'warning',
  CALIENTE: 'danger',
  ABIERTA: 'info',
  GANADA: 'success',
  PERDIDA: 'danger',
  CANCELADA: 'neutral',
  BORRADOR: 'neutral',
  ENVIADA: 'info',
  ACEPTADA: 'success',
  RECHAZADA: 'danger',
  VENCIDA: 'warning',
  PENDIENTE: 'warning',
  FACTURADA: 'info',
  COBRADA: 'success',
  ANULADA: 'danger',
  EN_PROGRESO: 'info',
  COMPLETADA: 'success',
  BAJA: 'neutral',
  MEDIA: 'info',
  ALTA: 'warning',
  URGENTE: 'danger',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <Badge tone={STATUS_TONES[value] ?? 'neutral'} className={className}>
      {translate(value)}
    </Badge>
  );
}
