import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  clients,
  contacts,
  opportunities,
  opportunityStageHistory,
  pipelineStages,
  prospectSources,
  prospects,
  users,
} from '../../db/schema';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { nextOpportunityCode } from '../../core/sequence';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { notifyAssignment } from '../../services/notification.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import type {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  MoveStageInput,
  UpdateOpportunityInput,
} from './opportunities.schema';

const SORTABLE = {
  name: opportunities.name,
  code: opportunities.code,
  amount: opportunities.amount,
  probability: opportunities.probability,
  status: opportunities.status,
  expectedCloseAt: opportunities.expectedCloseAt,
  createdAt: opportunities.createdAt,
  updatedAt: opportunities.updatedAt,
} as const;

const selection = {
  id: opportunities.id,
  code: opportunities.code,
  name: opportunities.name,
  amount: opportunities.amount,
  currency: opportunities.currency,
  probability: opportunities.probability,
  status: opportunities.status,
  openedAt: opportunities.openedAt,
  expectedCloseAt: opportunities.expectedCloseAt,
  closedAt: opportunities.closedAt,
  competitor: opportunities.competitor,
  lostReason: opportunities.lostReason,
  description: opportunities.description,
  createdAt: opportunities.createdAt,
  updatedAt: opportunities.updatedAt,
  clientId: opportunities.clientId,
  clientName: clients.legalName,
  prospectId: opportunities.prospectId,
  prospectName: sql<string | null>`NULLIF(TRIM(CONCAT(${prospects.firstName}, ' ', ${prospects.lastName})), '')`,
  contactId: opportunities.contactId,
  contactName: sql<string | null>`NULLIF(TRIM(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})), '')`,
  ownerId: opportunities.ownerId,
  ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
  stageId: opportunities.stageId,
  stageName: pipelineStages.name,
  stageColor: pipelineStages.color,
  stageOrder: pipelineStages.order,
  sourceId: opportunities.sourceId,
  sourceName: prospectSources.name,
};

function baseQuery() {
  return db
    .select(selection)
    .from(opportunities)
    .leftJoin(clients, eq(opportunities.clientId, clients.id))
    .leftJoin(prospects, eq(opportunities.prospectId, prospects.id))
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .innerJoin(pipelineStages, eq(opportunities.stageId, pipelineStages.id))
    .leftJoin(prospectSources, eq(opportunities.sourceId, prospectSources.id));
}

function buildFilters(req: Request, query: ListOpportunitiesQuery) {
  const conditions = [isNull(opportunities.deletedAt)];
  if (query.status) conditions.push(eq(opportunities.status, query.status));
  if (query.stageId) conditions.push(eq(opportunities.stageId, query.stageId));
  if (query.clientId) conditions.push(eq(opportunities.clientId, query.clientId));
  if (query.sourceId) conditions.push(eq(opportunities.sourceId, query.sourceId));
  if (query.minAmount !== undefined) conditions.push(gte(opportunities.amount, String(query.minAmount)));
  if (query.maxAmount !== undefined) conditions.push(lte(opportunities.amount, String(query.maxAmount)));
  if (query.from) conditions.push(gte(opportunities.openedAt, query.from));
  if (query.to) conditions.push(lte(opportunities.openedAt, query.to));

  if (!canSeeAllRecords(req, 'opportunities')) {
    conditions.push(or(eq(opportunities.ownerId, req.user!.id), isNull(opportunities.ownerId))!);
  } else if (query.ownerId) {
    conditions.push(eq(opportunities.ownerId, query.ownerId));
  }

  return combine(
    ...conditions,
    searchAcross([opportunities.name, opportunities.code, clients.legalName], query.search),
  );
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListOpportunitiesQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'createdAt');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db
      .select({ value: count() })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

/** Vista Kanban: etapas con sus oportunidades y totales por columna. */
export async function board(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListOpportunitiesQuery;
  const where = combine(buildFilters(req, { ...query, status: query.status ?? 'ABIERTA' }));

  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.isActive, true))
    .orderBy(asc(pipelineStages.order));

  const rows = await baseQuery().where(where).orderBy(desc(opportunities.updatedAt)).limit(500);

  const columns = stages.map((stage) => {
    const items = rows.filter((r) => r.stageId === stage.id);
    const total = items.reduce((acc, item) => acc + Number(item.amount), 0);
    return {
      stage,
      items,
      count: items.length,
      total: total.toFixed(2),
      weighted: items
        .reduce((acc, item) => acc + (Number(item.amount) * item.probability) / 100, 0)
        .toFixed(2),
    };
  });

  ok(res, columns);
}

async function findOrFail(id: string) {
  const [row] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Oportunidad no encontrada');
  return row;
}

function assertCanAccess(req: Request, ownerId: string | null): void {
  if (canSeeAllRecords(req, 'opportunities')) return;
  if (ownerId && ownerId !== req.user!.id) {
    throw new ForbiddenError('La oportunidad pertenece a otro ejecutivo');
  }
}

export async function detail(req: Request, res: Response): Promise<void> {
  const opportunity = await findOrFail(req.params.id!);
  assertCanAccess(req, opportunity.ownerId);

  const [row] = await baseQuery().where(eq(opportunities.id, opportunity.id)).limit(1);

  const history = await db.execute(sql`
    SELECT h.id, h.note, h.created_at AS "createdAt",
           fs.name AS "fromStageName", ts.name AS "toStageName",
           NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS "changedByName"
    FROM opportunity_stage_history h
    LEFT JOIN pipeline_stages fs ON fs.id = h.from_stage_id
    INNER JOIN pipeline_stages ts ON ts.id = h.to_stage_id
    LEFT JOIN users u ON u.id = h.changed_by_id
    WHERE h.opportunity_id = ${opportunity.id}
    ORDER BY h.created_at DESC
    LIMIT 100
  `);

  ok(res, { ...row, history: (history as unknown as { rows: unknown[] }).rows });
}

async function getStage(stageId: string) {
  const [stage] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, stageId)).limit(1);
  if (!stage) throw new BadRequestError('La etapa indicada no existe');
  return stage;
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateOpportunityInput;
  const stage = await getStage(input.stageId);

  const created = await db.transaction(async (tx) => {
    const code = await nextOpportunityCode(tx);
    const [row] = await tx
      .insert(opportunities)
      .values({
        ...input,
        code,
        ownerId: input.ownerId ?? req.user!.id,
        probability: input.probability ?? stage.probability,
        status: stage.isWon ? 'GANADA' : stage.isLost ? 'PERDIDA' : 'ABIERTA',
        closedAt: stage.isWon || stage.isLost ? new Date() : null,
      })
      .returning();

    await tx.insert(opportunityStageHistory).values({
      opportunityId: row!.id,
      fromStageId: null,
      toStageId: stage.id,
      changedById: req.user!.id,
      note: 'Creación de la oportunidad',
    });

    return row!;
  });

  await recordAudit({
    req, action: 'CREATE', entityType: 'OPPORTUNITY', entityId: created.id,
    entityLabel: created.name, module: 'opportunities', after: created,
  });

  await notifyAssignment({
    userId: created.ownerId,
    actorId: req.user!.id,
    title: `Nueva oportunidad asignada: ${created.name}`,
    entityType: 'OPPORTUNITY',
    entityId: created.id,
    link: `/oportunidades/${created.id}`,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);
  const input = req.body as UpdateOpportunityInput;

  if (input.ownerId !== undefined && !canSeeAllRecords(req, 'opportunities')) delete input.ownerId;

  // El cambio de etapa tiene su propio endpoint para garantizar el historial.
  const { stageId, ...rest } = input;
  if (stageId && stageId !== existing.stageId) {
    throw new BadRequestError('Use el endpoint de cambio de etapa para mover la oportunidad');
  }

  const [updated] = await db
    .update(opportunities)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(opportunities.id, existing.id))
    .returning();

  const changes = diff(existing as unknown as Record<string, unknown>, rest as Record<string, unknown>);
  await recordAudit({
    req, action: 'UPDATE', entityType: 'OPPORTUNITY', entityId: existing.id,
    entityLabel: updated!.name, module: 'opportunities', before: changes.before, after: changes.after,
  });

  ok(res, updated);
}

/** Mueve la oportunidad de etapa y registra el movimiento en el historial. */
export async function moveStage(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);
  const input = req.body as MoveStageInput;

  if (input.stageId === existing.stageId) {
    ok(res, existing);
    return;
  }

  const stage = await getStage(input.stageId);
  if (stage.isLost && !input.lostReason) {
    throw new BadRequestError('Debe indicar el motivo de pérdida al mover la oportunidad a esta etapa');
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(opportunities)
      .set({
        stageId: stage.id,
        probability: stage.probability,
        status: stage.isWon ? 'GANADA' : stage.isLost ? 'PERDIDA' : 'ABIERTA',
        closedAt: stage.isWon || stage.isLost ? new Date() : null,
        lostReason: stage.isLost ? (input.lostReason ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, existing.id))
      .returning();

    await tx.insert(opportunityStageHistory).values({
      opportunityId: existing.id,
      fromStageId: existing.stageId,
      toStageId: stage.id,
      changedById: req.user!.id,
      note: input.note ?? null,
    });

    return row!;
  });

  await recordAudit({
    req, action: 'STATUS_CHANGE', entityType: 'OPPORTUNITY', entityId: existing.id,
    entityLabel: existing.name, module: 'opportunities',
    before: { stageId: existing.stageId, status: existing.status },
    after: { stageId: stage.id, stageName: stage.name, status: updated.status, nota: input.note },
  });

  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  await db.update(opportunities).set({ deletedAt: new Date() }).where(eq(opportunities.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'OPPORTUNITY', entityId: existing.id,
    entityLabel: existing.name, module: 'opportunities', before: existing,
  });
  noContent(res);
}

export async function exportOpportunities(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListOpportunitiesQuery & { format: 'xlsx' | 'csv' };
  const rows = await baseQuery()
    .where(buildFilters(req, query))
    .orderBy(desc(opportunities.createdAt))
    .limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'OPPORTUNITY', module: 'opportunities', after: { registros: rows.length } });

  await sendExport(res, query.format, 'oportunidades', 'Oportunidades', [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Nombre', key: 'name', width: 40 },
    { header: 'Cliente', key: 'clientName', width: 36 },
    { header: 'Contacto', key: 'contactName', width: 26 },
    { header: 'Etapa', key: 'stageName', width: 18 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Valor', key: 'amount', width: 16 },
    { header: 'Probabilidad %', key: 'probability', width: 15 },
    { header: 'Responsable', key: 'ownerName', width: 26 },
    { header: 'Fuente', key: 'sourceName', width: 20 },
    { header: 'Apertura', key: 'openedAt', width: 20 },
    { header: 'Cierre estimado', key: 'expectedCloseAt', width: 20 },
    { header: 'Cierre real', key: 'closedAt', width: 20 },
    { header: 'Competencia', key: 'competitor', width: 22 },
    { header: 'Motivo de pérdida', key: 'lostReason', width: 30 },
  ], rows);
}
