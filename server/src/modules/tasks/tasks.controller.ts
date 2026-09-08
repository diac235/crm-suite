import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { clients, opportunities, prospects, taskComments, tasks, users } from '../../db/schema';
import { ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { notifyAssignment } from '../../services/notification.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from './tasks.schema';

const SORTABLE = {
  title: tasks.title,
  priority: tasks.priority,
  status: tasks.status,
  dueAt: tasks.dueAt,
  createdAt: tasks.createdAt,
} as const;

const selection = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  priority: tasks.priority,
  status: tasks.status,
  dueAt: tasks.dueAt,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  assigneeId: tasks.assigneeId,
  assigneeName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
  clientId: tasks.clientId,
  clientName: clients.legalName,
  prospectId: tasks.prospectId,
  prospectName: sql<string | null>`NULLIF(TRIM(CONCAT(${prospects.firstName}, ' ', ${prospects.lastName})), '')`,
  opportunityId: tasks.opportunityId,
  opportunityName: opportunities.name,
  isOverdue: sql<boolean>`(${tasks.dueAt} IS NOT NULL AND ${tasks.dueAt} < NOW() AND ${tasks.status} IN ('PENDIENTE','EN_PROGRESO'))`,
  commentsCount: sql<number>`(SELECT COUNT(*)::int FROM task_comments tc WHERE tc.task_id = ${tasks.id})`,
};

function baseQuery() {
  return db
    .select(selection)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .leftJoin(prospects, eq(tasks.prospectId, prospects.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id));
}

function buildFilters(req: Request, query: ListTasksQuery) {
  const conditions = [isNull(tasks.deletedAt)];
  if (query.status) conditions.push(eq(tasks.status, query.status));
  if (query.priority) conditions.push(eq(tasks.priority, query.priority));
  if (query.clientId) conditions.push(eq(tasks.clientId, query.clientId));
  if (query.opportunityId) conditions.push(eq(tasks.opportunityId, query.opportunityId));
  if (query.from) conditions.push(gte(tasks.dueAt, query.from));
  if (query.to) conditions.push(lte(tasks.dueAt, query.to));
  if (query.overdue) {
    conditions.push(isNotNull(tasks.dueAt));
    conditions.push(lte(tasks.dueAt, new Date()));
    conditions.push(or(eq(tasks.status, 'PENDIENTE'), eq(tasks.status, 'EN_PROGRESO'))!);
  }

  if (!canSeeAllRecords(req, 'tasks')) {
    conditions.push(or(eq(tasks.assigneeId, req.user!.id), eq(tasks.createdById, req.user!.id))!);
  } else if (query.assigneeId) {
    conditions.push(eq(tasks.assigneeId, query.assigneeId));
  }

  return combine(...conditions, searchAcross([tasks.title, tasks.description], query.search));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListTasksQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'dueAt');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(tasks).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt))).limit(1);
  if (!row) throw new NotFoundError('Tarea no encontrada');
  return row;
}

function assertCanAccess(req: Request, task: { assigneeId: string | null; createdById: string | null }): void {
  if (canSeeAllRecords(req, 'tasks')) return;
  if (task.assigneeId === req.user!.id || task.createdById === req.user!.id) return;
  throw new ForbiddenError('La tarea pertenece a otro usuario');
}

export async function detail(req: Request, res: Response): Promise<void> {
  const task = await findOrFail(req.params.id!);
  assertCanAccess(req, task);
  const [row] = await baseQuery().where(eq(tasks.id, task.id)).limit(1);
  const comments = await db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      authorId: taskComments.authorId,
      authorName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.authorId, users.id))
    .where(eq(taskComments.taskId, task.id))
    .orderBy(asc(taskComments.createdAt));
  ok(res, { ...row, comments });
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateTaskInput;
  const [created] = await db
    .insert(tasks)
    .values({
      ...input,
      assigneeId: input.assigneeId ?? req.user!.id,
      createdById: req.user!.id,
      completedAt: input.status === 'COMPLETADA' ? new Date() : null,
    })
    .returning();

  await recordAudit({
    req, action: 'CREATE', entityType: 'TASK', entityId: created!.id,
    entityLabel: created!.title, module: 'tasks', after: created,
  });

  await notifyAssignment({
    userId: created!.assigneeId,
    actorId: req.user!.id,
    title: `Nueva tarea asignada: ${created!.title}`,
    body: created!.dueAt ? `Vence el ${created!.dueAt.toLocaleString('es-EC')}` : undefined,
    entityType: 'TASK',
    entityId: created!.id,
    link: `/tareas?id=${created!.id}`,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing);
  const input = req.body as UpdateTaskInput;

  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (input.status === 'COMPLETADA' && existing.status !== 'COMPLETADA') patch.completedAt = new Date();
  if (input.status && input.status !== 'COMPLETADA') patch.completedAt = null;

  const [updated] = await db.update(tasks).set(patch).where(eq(tasks.id, existing.id)).returning();

  const changes = diff(existing as unknown as Record<string, unknown>, patch);
  await recordAudit({
    req,
    action: input.status && input.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'TASK', entityId: existing.id, entityLabel: updated!.title,
    module: 'tasks', before: changes.before, after: changes.after,
  });

  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    await notifyAssignment({
      userId: input.assigneeId,
      actorId: req.user!.id,
      title: `Tarea reasignada: ${updated!.title}`,
      entityType: 'TASK',
      entityId: existing.id,
      link: `/tareas?id=${existing.id}`,
    });
  }

  ok(res, updated);
}

export async function addComment(req: Request, res: Response): Promise<void> {
  const task = await findOrFail(req.params.id!);
  assertCanAccess(req, task);
  const { body } = req.body as { body: string };

  const [created] = await db
    .insert(taskComments)
    .values({ taskId: task.id, authorId: req.user!.id, body })
    .returning();

  await notifyAssignment({
    userId: task.assigneeId,
    actorId: req.user!.id,
    title: `Nuevo comentario en la tarea: ${task.title}`,
    body,
    entityType: 'TASK',
    entityId: task.id,
    link: `/tareas?id=${task.id}`,
  });

  ok(res, created, 201);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing);
  await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'TASK', entityId: existing.id,
    entityLabel: existing.title, module: 'tasks', before: existing,
  });
  noContent(res);
}

export async function exportTasks(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListTasksQuery & { format: 'xlsx' | 'csv' };
  const rows = await baseQuery().where(buildFilters(req, query)).orderBy(desc(tasks.createdAt)).limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'TASK', module: 'tasks', after: { registros: rows.length } });

  await sendExport(res, query.format, 'tareas', 'Tareas', [
    { header: 'Título', key: 'title', width: 40 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Prioridad', key: 'priority', width: 14 },
    { header: 'Responsable', key: 'assigneeName', width: 26 },
    { header: 'Cliente', key: 'clientName', width: 34 },
    { header: 'Oportunidad', key: 'opportunityName', width: 30 },
    { header: 'Vence', key: 'dueAt', width: 22 },
    { header: 'Completada', key: 'completedAt', width: 22 },
    { header: 'Vencida', key: 'isOverdue', width: 12, value: (r) => (r.isOverdue ? 'Sí' : 'No') },
  ], rows);
}
