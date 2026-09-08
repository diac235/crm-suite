const DATE_LOCALE = 'es-EC';

let currencyConfig = { code: 'USD', symbol: '$', locale: DATE_LOCALE, decimals: 2 };

export function setCurrencyConfig(config: typeof currencyConfig): void {
  currencyConfig = config;
}

export function formatMoney(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `${currencyConfig.symbol}${n.toLocaleString(currencyConfig.locale, {
    minimumFractionDigits: currencyConfig.decimals,
    maximumFractionDigits: currencyConfig.decimals,
  })}`;
}

export function formatNumber(value: string | number | null | undefined, decimals = 0): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(DATE_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPercent(value: string | number | null | undefined, decimals = 1): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString(DATE_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(DATE_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** Fecha relativa legible ("hace 3 días", "en 2 horas"). */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(DATE_LOCALE, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'ahora';
}

/** Convierte una fecha a valor válido para <input type="datetime-local">. */
export function toDateTimeInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Etiquetas legibles para los valores enumerados del backend. */
export const LABELS: Record<string, string> = {
  EMPRESA: 'Empresa',
  PERSONA_NATURAL: 'Persona natural',
  GOBIERNO: 'Gobierno',
  ONG: 'ONG',
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  ARCHIVADO: 'Archivado',
  POTENCIAL: 'Potencial',
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  CALIFICADO: 'Calificado',
  EN_NEGOCIACION: 'En negociación',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
  FRIO: 'Frío',
  TIBIO: 'Tibio',
  CALIENTE: 'Caliente',
  ABIERTA: 'Abierta',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
  CANCELADA: 'Cancelada',
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
  PENDIENTE: 'Pendiente',
  FACTURADA: 'Facturada',
  COBRADA: 'Cobrada',
  ANULADA: 'Anulada',
  EN_PROGRESO: 'En progreso',
  COMPLETADA: 'Completada',
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
  CONTRATO: 'Contrato',
  FACTURA: 'Factura',
  COTIZACION: 'Cotización',
  ORDEN_COMPRA: 'Orden de compra',
  IDENTIFICACION: 'Identificación',
  IMAGEN: 'Imagen',
  OTRO: 'Otro',
};

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return LABELS[value] ?? value;
}
