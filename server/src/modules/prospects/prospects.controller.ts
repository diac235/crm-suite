import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  activities,
  clients,
  contacts,
  documents,
  notes,
  opportunities,
  prospectSources,
  prospects,
  sectors,
  tasks,
  users,
} from '../../db/schema';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { nextClientCode, nextProspectCode } from '../../core/sequence';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { notifyAssignment } from '../../services/notification.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import type {
  ConvertProspectInput,
  CreateProspectInput,
  ListProspectsQuery,
  UpdateProspectInput,
} from './prospects.schema';

const SORTABLE = {
  firstName: prospects.firstName,
  lastName: prospects.lastName,
  companyName: prospects.companyName,
  status: prospects.status,
  temperature: prospects.temperature,
  enteredAt: prospects.enteredAt,
  nextFollowUpAt: prospects.nextFollowUpAt,
  createdAt: prospects.createdAt,
} as const;

const selection = {
  id: prospects.id,
  code: prospects.code,
  firstName: prospects.firstName,
  lastName: prospects.lastName,
  companyName: prospects.companyName,
  taxId: prospects.taxId,
  position: prospects.position,
  phone: prospects.phone,
  mobile: prospects.mobile,
  email: prospects.email,
  status: prospects.status,
  temperature: prospects.temperature,
  estimatedValue: prospects.estimatedValue,
  enteredAt: prospects.enteredAt,
  lastContactAt: prospects.lastContactAt,
  nextFollowUpAt: prospects.nextFollowUpAt,
  lostReason: prospects.lostReason,
  notes: prospects.notes,
  convertedAt: prospects.convertedAt,
  convertedClientId: prospects.convertedClientId,
  sourceId: prospects.sourceId,
  sourceName: prospectSources.name,
  sectorId: prospects.sectorId,
  sectorName: sectors.name,
  ownerId: prospects.ownerId,
  ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
  createdAt: prospects.createdAt,
  updatedAt: prospects.updatedAt,
};

function baseQuery() {
  return db
    .select(selection)
    .from(prospects)
    .leftJoin(prospectSources, eq(prospects.sourceId, prospectSources.id))
    .leftJoin(sectors, eq(prospects.sectorId, sectors.id))
    .leftJoin(users, eq(prospects.ownerId, users.id));
}

function buildFilters(req: Request, query: ListProspectsQuery) {
  const conditions = [isNull(prospects.deletedAt)];
  if (query.status) conditions.push(eq(prospects.status, query.status));
  if (query.temperature) conditions.push(eq(prospects.temperature, query.temperature));
  if (query.sourceId) conditions.push(eq(prospects.sourceId, query.sourceId));
  if (query.sectorId) conditions.push(eq(prospects.sectorId, query.sectorId));
  if (query.from) conditions.push(gte(prospects.enteredAt, query.from));
  if (query.to) conditions.push(lte(prospects.enteredAt, query.to));
  if (query.overdueFollowUp) {
    conditions.push(isNotNull(prospects.nextFollowUpAt));
    conditions.push(lte(prospects.nextFollowUpAt, new Date()));
  }

  if (!canSeeAllRecords(req, 'prospects')) {
    conditions.push(or(eq(prospects.ownerId, req.user!.id), isNull(prospects.ownerId))!);
  } else if (query.ownerId) {
    conditions.push(eq(prospects.ownerId, query.ownerId));
  }

  const search = searchAcross(
    [prospects.firstName, prospects.lastName, prospects.companyName, prospects.email, prospects.code, prospects.taxId],
    query.search,
  );
  return combine(...conditions, search);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListProspectsQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'createdAt');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(prospects).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

export async function exportProspects(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListProspectsQuery & { format: 'xlsx' | 'csv' };
  const rows = await baseQuery().where(buildFilters(req, query)).orderBy(desc(prospects.createdAt)).limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'PROSPECT', module: 'prospects', after: { registros: rows.length } });

  await sendExport(res, query.format, 'prospectos', 'Prospectos', [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Nombre', key: 'firstName', width: 20 },
    { header: 'Apellido', key: 'lastName', width: 20 },
    { header: 'Empresa', key: 'companyName', width: 32 },
    { header: 'Identificación', key: 'taxId', width: 18 },
    { header: 'Teléfono', key: 'phone', width: 18 },
    { header: 'Celular', key: 'mobile', width: 18 },
    { header: 'Correo', key: 'email', width: 30 },
    { header: 'Fuente', key: 'sourceName', width: 20 },
    { header: 'Sector', key: 'sectorName', width: 20 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Temperatura', key: 'temperature', width: 14 },
    { header: 'Valor estimado', key: 'estimatedValue', width: 16 },
    { header: 'Responsable', key: 'ownerName', width: 26 },
    { header: 'Ingreso', key: 'enteredAt', width: 20 },
    { header: 'Último contacto', key: 'lastContactAt', width: 20 },
    { header: 'Próximo seguimiento', key: 'nextFollowUpAt', width: 20 },
  ], rows);
}

async function findOrFail(id: string) {
  const [row] = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.id, id), isNull(prospects.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Prospecto no encontrado');
  return row;
}

function assertCanAccess(req: Request, ownerId: string | null): void {
  if (canSeeAllRecords(req, 'prospects')) return;
  if (ownerId && ownerId !== req.user!.id) {
    throw new ForbiddenError('El prospecto pertenece a otro ejecutivo');
  }
}

export async function detail(req: Request, res: Response): Promise<void> {
  const prospect = await findOrFail(req.params.id!);
  assertCanAccess(req, prospect.ownerId);
  const [row] = await baseQuery().where(eq(prospects.id, prospect.id)).limit(1);
  ok(res, row);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateProspectInput;

  const created = await db.transaction(async (tx) => {
    const code = await nextProspectCode(tx);
    const [row] = await tx
      .insert(prospects)
      .values({ ...input, code, ownerId: input.ownerId ?? req.user!.id })
      .returning();
    return row!;
  });

  await recordAudit({
    req,
    action: 'CREATE',
    entityType: 'PROSPECT',
    entityId: created.id,
    entityLabel: created.companyName ?? `${created.firstName} ${created.lastName ?? ''}`.trim(),
    module: 'prospects',
    after: created,
  });

  await notifyAssignment({
    userId: created.ownerId,
    actorId: req.user!.id,
    title: `Nuevo prospecto asignado: ${created.companyName ?? created.firstName}`,
    entityType: 'PROSPECT',
    entityId: created.id,
    link: `/prospectos/${created.id}`,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);

  const input = req.body as UpdateProspectInput;
  if (existing.status === 'CONVERTIDO' && input.status && input.status !== 'CONVERTIDO') {
    throw new ConflictError('Un prospecto convertido no puede cambiar de estado');
  }
  if (input.ownerId !== undefined && !canSeeAllRecords(req, 'prospects')) delete input.ownerId;

  const [updated] = await db
    .update(prospects)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(prospects.id, existing.id))
    .returning();

  const changes = diff(existing as unknown as Record<string, unknown>, input as Record<string, unknown>);
  await recordAudit({
    req,
    action: input.status && input.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'PROSPECT',
    entityId: existing.id,
    entityLabel: updated!.companyName ?? updated!.firstName,
    module: 'prospects',
    before: changes.before,
    after: changes.after,
  });

  ok(res, updated);
}

/**
 * Convierte un prospecto en cliente conservando todo su historial:
 * actividades, tareas, notas, documentos y oportunidades se re-vinculan.
 */
export async function convert(req: Request, res: Response): Promise<void> {
  const prospect = await findOrFail(req.params.id!);
  assertCanAccess(req, prospect.ownerId);

  if (prospect.status === 'CONVERTIDO' || prospect.convertedClientId) {
    throw new ConflictError('El prospecto ya fue convertido en cliente');
  }

  const input = req.body as ConvertProspectInput;
  const taxId = input.taxId ?? prospect.taxId ?? null;

  if (taxId) {
    const [duplicate] = await db
      .select({ id: clients.id, legalName: clients.legalName })
      .from(clients)
      .where(and(eq(clients.taxId, taxId), isNull(clients.deletedAt)))
      .limit(1);
    if (duplicate) {
      throw new ConflictError(`Ya existe un cliente con la identificación ${taxId}: ${duplicate.legalName}`);
    }
  }

  const result = await db.transaction(async (tx) => {
    const code = await nextClientCode(tx);
    const [client] = await tx
      .insert(clients)
      .values({
        code,
        kind: input.kind,
        taxId,
        legalName: input.legalName,
        tradeName: input.tradeName ?? prospect.companyName ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country,
        phone: prospect.phone,
        mobile: prospect.mobile,
        email: prospect.email,
        sectorId: prospect.sectorId,
        ownerId: prospect.ownerId ?? req.user!.id,
        status: 'ACTIVO',
        notes: prospect.notes,
        convertedFromProspectId: prospect.id,
      })
      .returning();

    if (input.createPrimaryContact) {
      await tx.insert(contacts).values({
        clientId: client!.id,
        firstName: prospect.firstName,
        lastName: prospect.lastName ?? '-',
        position: prospect.position,
        email: prospect.email,
        phone: prospect.phone,
        mobile: prospect.mobile,
        whatsapp: prospect.mobile,
        isPrimary: true,
      });
    }

    // Re-vinculación del historial existente al nuevo cliente.
    await tx.update(activities).set({ clientId: client!.id }).where(eq(activities.prospectId, prospect.id));
    await tx.update(tasks).set({ clientId: client!.id }).where(eq(tasks.prospectId, prospect.id));
    await tx.update(notes).set({ clientId: client!.id }).where(eq(notes.prospectId, prospect.id));
    await tx.update(documents).set({ clientId: client!.id }).where(eq(documents.prospectId, prospect.id));
    await tx.update(opportunities).set({ clientId: client!.id }).where(eq(opportunities.prospectId, prospect.id));

    const [updatedProspect] = await tx
      .update(prospects)
      .set({
        status: 'CONVERTIDO',
        convertedAt: new Date(),
        convertedClientId: client!.id,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, prospect.id))
      .returning();

    return { client: client!, prospect: updatedProspect! };
  });

  await recordAudit({
    req,
    action: 'CONVERT',
    entityType: 'PROSPECT',
    entityId: prospect.id,
    entityLabel: prospect.companyName ?? prospect.firstName,
    module: 'prospects',
    before: { status: prospect.status },
    after: { status: 'CONVERTIDO', clientId: result.client.id, clientCode: result.client.code },
  });

  await recordAudit({
    req,
    action: 'CREATE',
    entityType: 'CLIENT',
    entityId: result.client.id,
    entityLabel: result.client.legalName,
    module: 'clients',
    after: { origen: 'conversión de prospecto', prospectCode: prospect.code },
  });

  ok(res, result, 201);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  if (existing.convertedClientId) {
    throw new ConflictError('No se puede eliminar un prospecto ya convertido en cliente');
  }
  await db.update(prospects).set({ deletedAt: new Date() }).where(eq(prospects.id, existing.id));
  await recordAudit({
    req,
    action: 'DELETE',
    entityType: 'PROSPECT',
    entityId: existing.id,
    entityLabel: existing.companyName ?? existing.firstName,
    module: 'prospects',
    before: existing,
  });
  noContent(res);
}
