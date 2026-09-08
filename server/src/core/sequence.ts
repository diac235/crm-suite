import { sql } from 'drizzle-orm';
import type { Database, Transaction } from '../db';

type Executor = Database | Transaction;

/**
 * Genera el siguiente número de una secuencia de negocio de forma atómica.
 * Usa `INSERT ... ON CONFLICT DO UPDATE` para evitar condiciones de carrera.
 */
export async function nextSequence(exec: Executor, key: string): Promise<number> {
  const result = await exec.execute(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  const rows = (result as unknown as { rows: Array<{ value: number }> }).rows;
  return Number(rows[0]?.value ?? 1);
}

export function formatCode(prefix: string, value: number, width = 6): string {
  return `${prefix}-${String(value).padStart(width, '0')}`;
}

export function formatYearlyCode(prefix: string, value: number, year: number, width = 6): string {
  return `${prefix}-${year}-${String(value).padStart(width, '0')}`;
}

export async function nextClientCode(exec: Executor): Promise<string> {
  return formatCode('CLI', await nextSequence(exec, 'client'));
}

export async function nextProspectCode(exec: Executor): Promise<string> {
  return formatCode('PRO', await nextSequence(exec, 'prospect'));
}

export async function nextOpportunityCode(exec: Executor): Promise<string> {
  return formatCode('OPP', await nextSequence(exec, 'opportunity'));
}

export async function nextQuoteNumber(exec: Executor, year = new Date().getFullYear()): Promise<string> {
  return formatYearlyCode('COT', await nextSequence(exec, `quote:${year}`), year);
}

export async function nextSaleNumber(exec: Executor, year = new Date().getFullYear()): Promise<string> {
  return formatYearlyCode('VTA', await nextSequence(exec, `sale:${year}`), year);
}
