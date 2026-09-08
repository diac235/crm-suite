/**
 * Utilidades de cálculo monetario.
 * Se trabaja en centavos con enteros para evitar errores de punto flotante
 * y se devuelve siempre una cadena con 2 decimales apta para `numeric`.
 */

const SCALE = 100;

export function toCents(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * SCALE);
}

export function fromCents(cents: number): string {
  return (cents / SCALE).toFixed(2);
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): string {
  return (Math.round(value * SCALE) / SCALE).toFixed(2);
}

export interface LineInput {
  quantity: number | string;
  unitPrice: number | string;
  discountPct: number | string;
  taxPct: number | string;
}

export interface LineTotals {
  lineSubtotal: string;
  lineDiscount: string;
  lineTax: string;
  lineTotal: string;
}

/** Calcula los totales de una línea de cotización con precisión de centavos. */
export function computeLine(input: LineInput): LineTotals {
  const qty = toNumber(input.quantity);
  const price = toNumber(input.unitPrice);
  const discountPct = toNumber(input.discountPct);
  const taxPct = toNumber(input.taxPct);

  const grossCents = Math.round(qty * price * SCALE);
  const discountCents = Math.round((grossCents * discountPct) / 100);
  const netCents = grossCents - discountCents;
  const taxCents = Math.round((netCents * taxPct) / 100);

  return {
    lineSubtotal: fromCents(grossCents),
    lineDiscount: fromCents(discountCents),
    lineTax: fromCents(taxCents),
    lineTotal: fromCents(netCents + taxCents),
  };
}

export interface DocumentTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}

export function sumTotals(lines: LineTotals[]): DocumentTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal += toCents(line.lineSubtotal);
    discount += toCents(line.lineDiscount);
    tax += toCents(line.lineTax);
  }
  const total = subtotal - discount + tax;
  return {
    subtotal: fromCents(subtotal),
    discountTotal: fromCents(discount),
    taxTotal: fromCents(tax),
    total: fromCents(total),
  };
}
