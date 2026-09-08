import type { Request, Response } from 'express';
import { z } from 'zod';
import { count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db';
import { auditLogs, users } from '../../db/schema';
import { ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, paginationSchema } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { sendExport } from '../../services/export.service';

const actions = [
  'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGOUT',
  'LOGIN_FAILED', 'EXPORT', 'DOWNLOAD', 'STATUS_CHANGE', 'CONVERT',
] as const;

const entityTypes = [
  'CLIENT', 'CONTACT', 'PROSPECT', 'OPPORTUNITY', 'QUOTE', 'SALE', 'ACTIVITY',
  'TASK', 'DOCUMENT', 'NOTE', 'USER', 'ROLE', 'PRODUCT', 'SETTING', 'TEAM', 'CATALOG',
] as const;

export const listAuditSchema = paginationSchema.extend({
  action: z.enum(actions).optional(),
  entityType: z.enum(entityTypes).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  module: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportAuditSchema = listAuditSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(20_000).default(5000),
});

type ListAuditQuery = z.infer<typeof listAuditSchema>;

const selection = {
  id: auditLogs.id,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  entityLabel: auditLogs.entityLabel,
  module: auditLogs.module,
  ipAddress: auditLogs.ipAddress,
  before: auditLogs.before,
  after: auditLogs.after,
  createdAt: auditLogs.createdAt,
  userId: auditLogs.userId,
  userEmail: auditLogs.userEmail,
  userName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
};

function buildFilters(query: ListAuditQuery) {
  const conditions = [];
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
  if (query.userId) conditions.push(eq(auditLogs.userId, query.userId));
  if (query.module) conditions.push(eq(auditLogs.module, query.module));
  if (query.from) conditions.push(gte(auditLogs.createdAt, query.from));
  if (query.to) conditions.push(lte(auditLogs.createdAt, query.to));
  return combine(...conditions, searchAcross([auditLogs.entityLabel, auditLogs.userEmail], query.search));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAuditQuery;
  const where = buildFilters(query);

  const [rows, [total]] = await Promise.all([
    db
      .select(selection)
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

export async function exportAudit(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAuditQuery & { format: 'xlsx' | 'csv' };
  const rows = await db
    .select(selection)
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(buildFilters(query))
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.pageSize);

  await sendExport(res, query.format, 'auditoria', 'Auditoría', [
    { header: 'Fecha y hora', key: 'createdAt', width: 22 },
    { header: 'Usuario', key: 'userName', width: 26 },
    { header: 'Correo', key: 'userEmail', width: 30 },
    { header: 'Acción', key: 'action', width: 16 },
    { header: 'Módulo', key: 'module', width: 18 },
    { header: 'Entidad', key: 'entityType', width: 16 },
    { header: 'Registro', key: 'entityLabel', width: 40 },
    { header: 'IP', key: 'ipAddress', width: 18 },
    { header: 'Datos anteriores', key: 'before', width: 40, value: (r) => (r.before ? JSON.stringify(r.before) : '') },
    { header: 'Datos nuevos', key: 'after', width: 40, value: (r) => (r.after ? JSON.stringify(r.after) : '') },
  ], rows);
}

/** Resumen de actividad para el panel de auditoría. */
export async function stats(_req: Request, res: Response): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const byAction = await db
    .select({ action: auditLogs.action, total: count() })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, since))
    .groupBy(auditLogs.action);

  const byUser = await db
    .select({
      userEmail: auditLogs.userEmail,
      total: count(),
    })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, since))
    .groupBy(auditLogs.userEmail)
    .orderBy(desc(count()))
    .limit(10);

  ok(res, { byAction, byUser, since });
}
