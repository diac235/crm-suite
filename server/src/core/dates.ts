import { z } from 'zod';

export type PeriodKey =
  | 'hoy'
  | 'semana'
  | 'mes'
  | 'trimestre'
  | 'anio'
  | 'personalizado'
  | 'todo';

export const periodSchema = z.object({
  period: z
    .enum(['hoy', 'semana', 'mes', 'trimestre', 'anio', 'personalizado', 'todo'])
    .default('mes'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type PeriodQuery = z.infer<typeof periodSchema>;

export interface DateRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Convierte un período lógico en un rango concreto e incluye el rango
 * inmediatamente anterior de igual duración para calcular variaciones.
 */
export function resolveRange(query: PeriodQuery, now = new Date()): DateRange {
  let from: Date;
  let to: Date = endOfDay(now);

  switch (query.period) {
    case 'hoy':
      from = startOfDay(now);
      break;
    case 'semana': {
      const day = now.getDay(); // 0 = domingo
      const diff = day === 0 ? 6 : day - 1; // semana inicia lunes
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      from = startOfDay(monday);
      break;
    }
    case 'mes':
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      break;
    case 'trimestre': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      from = startOfDay(new Date(now.getFullYear(), quarterStartMonth, 1));
      break;
    }
    case 'anio':
      from = startOfDay(new Date(now.getFullYear(), 0, 1));
      break;
    case 'todo':
      from = new Date(2000, 0, 1);
      break;
    case 'personalizado':
    default:
      from = query.from ? startOfDay(query.from) : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      to = query.to ? endOfDay(query.to) : endOfDay(now);
      break;
  }

  const spanMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - spanMs);

  return { from, to, previousFrom, previousTo };
}

