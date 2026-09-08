import { type SQL, and, ilike, or } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/** Combina condiciones ignorando las indefinidas. */
export function combine(...conditions: Array<SQL | undefined>): SQL | undefined {
  const valid = conditions.filter((c): c is SQL => c !== undefined);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return and(...valid);
}

/** Búsqueda parcial insensible a mayúsculas sobre varias columnas. */
export function searchAcross(columns: PgColumn[], term: string | undefined): SQL | undefined {
  const value = term?.trim();
  if (!value) return undefined;
  const pattern = `%${value.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const conditions = columns.map((column) => ilike(column, pattern));
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

