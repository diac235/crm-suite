/**
 * Paleta de visualización validada con el verificador de accesibilidad
 * (banda de luminosidad, croma mínimo, separación para daltonismo y
 * contraste sobre la superficie clara).
 *
 * Regla aplicada: los colores categóricos se asignan en orden fijo, nunca
 * se ciclan; las magnitudes usan un único tono. Toda serie lleva además
 * etiqueta directa o tooltip, nunca se distingue solo por color.
 */
export const CATEGORICAL = [
  '#2a78d6', // 1 azul
  '#eb6834', // 2 naranja
  '#1baf7a', // 3 aqua
  '#eda100', // 4 amarillo
  '#e87ba4', // 5 magenta
  '#008300', // 6 verde
] as const;

/** Tono único para comparaciones de magnitud (barras de un solo valor). */
export const SEQUENTIAL_HUE = '#2a78d6';

/** Colores reservados de estado: nunca se usan como "serie N". */
export const STATUS_COLORS = {
  good: '#1baf7a',
  warning: '#eda100',
  critical: '#e34948',
  neutral: '#94a3b8',
} as const;

export const CHART_TOKENS = {
  surface: '#ffffff',
  grid: '#e2e8f0',
  axis: '#94a3b8',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
};

/** Etiquetas cortas de mes para los ejes temporales. */
export function shortDate(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-');
    const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${names[Number(month) - 1]} ${year!.slice(2)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, month, day] = value.split('-');
    return `${day}/${month}`;
  }
  return value;
}
