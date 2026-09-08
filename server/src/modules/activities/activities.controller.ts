import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  activities,
  activityTypes,
  clients,
  contacts,
  opportunities,
  prospects,
  tasks,
  users,
} from '../../db/schema';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { notifyAssignment } from '../../services/notification.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import { assertRelatedOwnership } from '../../core/scope';
import type {
  CalendarQuery,
  CreateActivityInput,
  ListActivitiesQuery,
  UpdateActivityInput,
} from './activities.schema';

const SORTABLE = {
  subject: activities.subject,
  scheduledAt: activities.scheduledAt,
  status: activities.status,
  createdAt: activities.createdAt,
} as const;

const selection = {
  id: activities.id,
  subject: activities.subject,
  description: activities.description,
  status: activities.status,
  scheduledAt: activities.scheduledAt,
  durationMin: activities.durationMin,
  completedAt: activities.completedAt,
  location: activities.location,
  outcome: activities.outcome,
  createdAt: activities.createdAt,
  updatedAt: activities.updatedAt,
  typeId: activities.typeId,
  typeName: activityTypes.name,
  typeCode: activityTypes.code,
  typeColor: activityTypes.color,
  typeIcon: activityTypes.icon,
  clientId: activities.clientId,
  clientName: clients.legalName,
  contactId: activities.contactId,
  contactName: sql<string | null>`NULLIF(TRIM(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})), '')`,
  prospectId: activities.prospectId,
  prospectName: sql<string | null>`NULLIF(TRIM(CONCAT(${prospects.firstName}, ' ', ${prospects.lastName})), '')`,
  opportunityId: activities.opportunityId,
  opportunityName: opportunities.name,
  quoteId: activities.quoteId,
  ownerId: activities.ownerId,
  ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
};

function baseQuery() {
  return db
    .select(selection)
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(clients, eq(activities.clientId, clients.id))
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .leftJoin(prospects, eq(activities.prospectId, prospects.id))
    .leftJoin(opportunities, eq(activities.opportunityId, opportunities.id))
    .leftJoin(users, eq(activities.ownerId, users.id));
}

function buildFilters(req: Request, query: Partial<ListActivitiesQuery>) {
  const conditions = [isNull(activities.deletedAt)];
  if (query.status) conditions.push(eq(activities.status, query.status));
  if (query.typeId) conditions.push(eq(activities.typeId, query.typeId));
  if (query.clientId) conditions.push(eq(activities.clientId, query.clientId));
  if (query.prospectId) conditions.push(eq(activities.prospectId, query.prospectId));
  if (query.opportunityId) conditions.push(eq(activities.opportunityId, query.opportunityId));
  if (query.from) conditions.push(gte(activities.scheduledAt, query.from));
  if (query.to) conditions.push(lte(activities.scheduledAt, query.to));

  if (!canSeeAllRecords(req, 'activities')) {
    conditions.push(or(eq(activities.ownerId, req.user!.id), isNull(activities.ownerId))!);
  } else if (query.ownerId) {
    conditions.push(eq(activities.ownerId, query.ownerId));
  }

  return combine(...conditions, searchAcross([activities.subject, activities.description], query.search));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListActivitiesQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'scheduledAt');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(activities).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

/** Eventos del calendario: actividades + tareas con fecha límite. */
export async function calendar(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as CalendarQuery;

  const activityRows = await baseQuery()
    .where(buildFilters(req, { from: query.from, to: query.to, ownerId: query.ownerId, typeId: query.typeId }))
    .orderBy(asc(activities.scheduledAt))
    .limit(1000);

  const events = activityRows.map((row) => ({
    id: row.id,
    kind: 'ACTIVIDAD' as const,
    title: row.subject,
    start: row.scheduledAt,
    end: new Date(row.scheduledAt.getTime() + row.durationMin * 60_000),
    color: row.typeColor ?? '#6366f1',
    status: row.status,
    typeCode: row.typeCode,
    clientName: row.clientName,
    ownerName: row.ownerName,
    link: `/actividades/${row.id}`,
  }));

  if (query.includeTasks) {
    const taskConditions = [
      isNull(tasks.deletedAt),
      isNotNull(tasks.dueAt),
      gte(tasks.dueAt, query.from),
      lte(tasks.dueAt, query.to),
    ];
    if (!canSeeAllRecords(req, 'tasks')) {
      taskConditions.push(or(eq(tasks.assigneeId, req.user!.id), isNull(tasks.assigneeId))!);
    } else if (query.ownerId) {
      taskConditions.push(eq(tasks.assigneeId, query.ownerId));
    }

    const taskRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueAt: tasks.dueAt,
        status: tasks.status,
        priority: tasks.priority,
        clientName: clients.legalName,
        assigneeName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
      })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(...taskConditions))
      .limit(1000);

    for (const task of taskRows) {
      events.push({
        id: task.id,
        kind: 'TAREA' as unknown as 'ACTIVIDAD',
        title: task.title,
        start: task.dueAt!,
        end: new Date(task.dueAt!.getTime() + 30 * 60_000),
        color: task.priority === 'URGENTE' ? '#dc2626' : task.priority === 'ALTA' ? '#f59e0b' : '#0ea5e9',
        status: task.status as never,
        typeCode: 'TAREA',
        clientName: task.clientName,
        ownerName: task.assigneeName,
        link: `/tareas?id=${task.id}`,
      });
    }
  }

  ok(res, events.sort((a, b) => a.start.getTime() - b.start.getTime()));
}

async function findOrFail(id: string) {
  const [row] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Actividad no encontrada');
  return row;
}

function assertCanAccess(req: Request, ownerId: string | null): void {
  if (canSeeAllRecords(req, 'activities')) return;
  if (ownerId && ownerId !== req.user!.id) throw new ForbiddenError('La actividad pertenece a otro usuario');
}

export async function detail(req: Request, res: Response): Promise<void> {
  const activity = await findOrFail(req.params.id!);
  assertCanAccess(req, activity.ownerId);
  const [row] = await baseQuery().where(eq(activities.id, activity.id)).limit(1);
  ok(res, row);
}

async function assertTypeExists(typeId: string): Promise<void> {
  const [row] = await db.select({ id: activityTypes.id }).from(activityTypes).where(eq(activityTypes.id, typeId)).limit(1);
  if (!row) throw new BadRequestError('El tipo de actividad indicado no existe');
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateActivityInput;
  await assertTypeExists(input.typeId);

  if (!input.clientId && !input.prospectId && !input.opportunityId) {
    throw new BadRequestError('La actividad debe asociarse a un cliente, prospecto u oportunidad');
  }

  await assertRelatedOwnership(req, 'activities', input);

  const [created] = await db
    .insert(activities)
    .values({
      ...input,
      ownerId: input.ownerId ?? req.user!.id,
      completedAt: input.status === 'COMPLETADA' ? new Date() : null,
    })
    .returning();

  await recordAudit({
    req, action: 'CREATE', entityType: 'ACTIVITY', entityId: created!.id,
    entityLabel: created!.subject, module: 'activities', after: created,
  });

  await notifyAssignment({
    userId: created!.ownerId,
    actorId: req.user!.id,
    title: `Nueva actividad asignada: ${created!.subject}`,
    entityType: 'ACTIVITY',
    entityId: created!.id,
    link: `/actividades/${created!.id}`,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);
  const input = req.body as UpdateActivityInput;
  if (input.typeId) await assertTypeExists(input.typeId);

  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (input.status === 'COMPLETADA' && existing.status !== 'COMPLETADA') patch.completedAt = new Date();
  if (input.status && input.status !== 'COMPLETADA') patch.completedAt = null;
  if (patch.ownerId !== undefined && !canSeeAllRecords(req, 'activities')) delete patch.ownerId;

  const [updated] = await db.update(activities).set(patch).where(eq(activities.id, existing.id)).returning();

  const changes = diff(existing as unknown as Record<string, unknown>, patch);
  await recordAudit({
    req,
    action: input.status && input.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'ACTIVITY', entityId: existing.id, entityLabel: updated!.subject,
    module: 'activities', before: changes.before, after: changes.after,
  });

  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);
  await db.update(activities).set({ deletedAt: new Date() }).where(eq(activities.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'ACTIVITY', entityId: existing.id,
    entityLabel: existing.subject, module: 'activities', before: existing,
  });
  noContent(res);
}

export async function exportActivities(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListActivitiesQuery & { format: 'xlsx' | 'csv' };
  const rows = await baseQuery().where(buildFilters(req, query)).orderBy(desc(activities.scheduledAt)).limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'ACTIVITY', module: 'activities', after: { registros: rows.length } });

  await sendExport(res, query.format, 'actividades', 'Actividades', [
    { header: 'Tipo', key: 'typeName', width: 18 },
    { header: 'Asunto', key: 'subject', width: 40 },
    { header: 'Cliente', key: 'clientName', width: 34 },
    { header: 'Contacto', key: 'contactName', width: 26 },
    { header: 'Oportunidad', key: 'opportunityName', width: 30 },
    { header: 'Responsable', key: 'ownerName', width: 26 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Fecha y hora', key: 'scheduledAt', width: 22 },
    { header: 'Duración (min)', key: 'durationMin', width: 15 },
    { header: 'Resultado', key: 'outcome', width: 40 },
  ], rows);
}
