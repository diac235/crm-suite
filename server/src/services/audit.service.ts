import type { Request } from 'express';
import { db } from '../db';
import { auditLogs } from '../db/schema';
import { logger } from '../config/logger';

type AuditAction = (typeof auditLogs.action.enumValues)[number];
type EntityType = (typeof auditLogs.entityType.enumValues)[number];

export interface AuditInput {
  req?: Request;
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  module: string;
  before?: unknown;
  after?: unknown;
}

/** Campos que jamás deben quedar registrados en la bitácora. */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'refreshToken',
  'accessToken',
]);

export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key) ? '[REDACTADO]' : sanitizeForAudit(val);
    }
    return out;
  }
  return value;
}

export function clientIp(req?: Request): string | null {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim().slice(0, 64);
  }
  return (req.ip ?? req.socket.remoteAddress ?? null)?.slice(0, 64) ?? null;
}

/**
 * Registra un evento de auditoría.
 * Nunca lanza: un fallo de auditoría no debe romper la operación de negocio,
 * pero sí queda registrado en el log del servidor.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: input.userId ?? input.req?.user?.id ?? null,
      userEmail: input.userEmail ?? input.req?.user?.email ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel?.slice(0, 255) ?? null,
      module: input.module,
      ipAddress: clientIp(input.req),
      userAgent: input.req?.headers['user-agent']?.slice(0, 500) ?? null,
      before: input.before === undefined ? null : (sanitizeForAudit(input.before) as object),
      after: input.after === undefined ? null : (sanitizeForAudit(input.after) as object),
    });
  } catch (err) {
    logger.error({ err, action: input.action, module: input.module }, 'No se pudo registrar auditoría');
  }
}

/** Devuelve solo los campos que cambiaron entre dos versiones de un registro. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as Array<keyof T>) {
    const prev = before[key];
    const next = after[key];
    const prevVal = prev instanceof Date ? prev.getTime() : prev;
    const nextVal = next instanceof Date ? next.getTime() : next;
    if (prevVal !== nextVal) {
      b[key] = prev;
      a[key] = next as T[keyof T];
    }
  }
  return { before: b, after: a };
}
