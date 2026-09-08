import { z } from 'zod';
import type { PageMeta } from './http';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.string().max(60).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(160).optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export function buildMeta(page: number, pageSize: number, total: number): PageMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Resuelve una columna de ordenamiento contra una lista blanca.
 * Evita inyección de identificadores desde el query string.
 */
export function resolveSort<T extends Record<string, unknown>>(
  map: T,
  requested: string | undefined,
  fallback: keyof T,
): T[keyof T] {
  if (requested && Object.prototype.hasOwnProperty.call(map, requested)) {
    return map[requested as keyof T];
  }
  return map[fallback];
}
