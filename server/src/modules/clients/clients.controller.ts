import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { clients, contacts, sectors, users } from '../../db/schema';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { getClientSummary, getClientTimeline } from '../../services/timeline.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import { nextClientCode } from '../../core/sequence';
import type { CreateClientInput, ListClientsQuery, UpdateClientInput } from './clients.schema';

const SORTABLE = {
  legalName: clients.legalName,
  tradeName: clients.tradeName,
  code: clients.code,
  city: clients.city,
  status: clients.status,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
} as const;

const listSelection = {
  id: clients.id,
  code: clients.code,
  kind: clients.kind,
  taxId: clients.taxId,
  legalName: clients.legalName,
  tradeName: clients.tradeName,
  city: clients.city,
  state: clients.state,
  country: clients.country,
  phone: clients.phone,
  mobile: clients.mobile,
  email: clients.email,
  website: clients.website,
  status: clients.status,
  economicActivity: clients.economicActivity,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
  sectorId: clients.sectorId,
  sectorName: sectors.name,
  ownerId: clients.ownerId,
  ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
  contactsCount: sql<number>`(SELECT COUNT(*)::int FROM contacts c WHERE c.client_id = ${clients.id} AND c.deleted_at IS NULL)`,
};

function buildFilters(req: Request, query: ListClientsQuery) {
  const conditions = [isNull(clients.deletedAt)];

  if (!query.includeArchived && !query.status) {
    conditions.push(ne(clients.status, 'ARCHIVADO'));
  }
  if (query.status) conditions.push(eq(clients.status, query.status));
  if (query.kind) conditions.push(eq(clients.kind, query.kind));
  if (query.sectorId) conditions.push(eq(clients.sectorId, query.sectorId));
  if (query.city) conditions.push(eq(clients.city, query.city));
  if (query.from) conditions.push(gte(clients.createdAt, query.from));
  if (query.to) conditions.push(lte(clients.createdAt, query.to));

  // Un ejecutivo sin permisos ampliados solo ve su propia cartera.
  if (!canSeeAllRecords(req, 'clients')) {
    conditions.push(or(eq(clients.ownerId, req.user!.id), isNull(clients.ownerId))!);
  } else if (query.ownerId) {
    conditions.push(eq(clients.ownerId, query.ownerId));
  }

  const search = searchAcross(
    [clients.legalName, clients.tradeName, clients.taxId, clients.email, clients.code, clients.city],
    query.search,
  );

  return combine(...conditions, search);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListClientsQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'createdAt');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    db
      .select(listSelection)
      .from(clients)
      .leftJoin(sectors, eq(clients.sectorId, sectors.id))
      .leftJoin(users, eq(clients.ownerId, users.id))
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(clients).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

export async function exportClients(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListClientsQuery & { format: 'xlsx' | 'csv' };
  const where = buildFilters(req, query);

  const rows = await db
    .select(listSelection)
    .from(clients)
    .leftJoin(sectors, eq(clients.sectorId, sectors.id))
    .leftJoin(users, eq(clients.ownerId, users.id))
    .where(where)
    .orderBy(asc(clients.legalName))
    .limit(query.pageSize);

  await recordAudit({
    req,
    action: 'EXPORT',
    entityType: 'CLIENT',
    module: 'clients',
    after: { formato: query.format, registros: rows.length },
  });

  await sendExport(res, query.format, 'clientes', 'Clientes', [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Tipo', key: 'kind', width: 16 },
    { header: 'Identificación', key: 'taxId', width: 18 },
    { header: 'Razón social', key: 'legalName', width: 38 },
    { header: 'Nombre comercial', key: 'tradeName', width: 28 },
    { header: 'Sector', key: 'sectorName', width: 20 },
    { header: 'Ciudad', key: 'city', width: 18 },
    { header: 'Provincia', key: 'state', width: 18 },
    { header: 'País', key: 'country', width: 14 },
    { header: 'Teléfono', key: 'phone', width: 18 },
    { header: 'Celular', key: 'mobile', width: 18 },
    { header: 'Correo', key: 'email', width: 30 },
    { header: 'Sitio web', key: 'website', width: 26 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Ejecutivo', key: 'ownerName', width: 26 },
    { header: 'Contactos', key: 'contactsCount', width: 12 },
    { header: 'Creado', key: 'createdAt', width: 20 },
  ], rows);
}

async function findClientOrFail(id: string) {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Cliente no encontrado');
  return row;
}

function assertCanAccess(req: Request, ownerId: string | null): void {
  if (canSeeAllRecords(req, 'clients')) return;
  if (ownerId && ownerId !== req.user!.id) {
    throw new ForbiddenError('El cliente pertenece a otro ejecutivo');
  }
}

export async function detail(req: Request, res: Response): Promise<void> {
  const client = await findClientOrFail(req.params.id!);
  assertCanAccess(req, client.ownerId);

  const [enriched] = await db
    .select({
      ...listSelection,
      address: clients.address,
      notes: clients.notes,
      creditLimit: clients.creditLimit,
      convertedFromProspectId: clients.convertedFromProspectId,
    })
    .from(clients)
    .leftJoin(sectors, eq(clients.sectorId, sectors.id))
    .leftJoin(users, eq(clients.ownerId, users.id))
    .where(eq(clients.id, client.id))
    .limit(1);

  const clientContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.clientId, client.id), isNull(contacts.deletedAt)))
    .orderBy(desc(contacts.isPrimary), asc(contacts.lastName));

  ok(res, { ...enriched, contacts: clientContacts });
}

export async function summary(req: Request, res: Response): Promise<void> {
  const client = await findClientOrFail(req.params.id!);
  assertCanAccess(req, client.ownerId);
  ok(res, await getClientSummary(client.id));
}

export async function timeline(req: Request, res: Response): Promise<void> {
  const client = await findClientOrFail(req.params.id!);
  assertCanAccess(req, client.ownerId);
  ok(res, await getClientTimeline(client.id));
}

async function assertNoDuplicate(taxId: string | null, excludeId?: string): Promise<void> {
  if (!taxId) return;
  const conditions = [eq(clients.taxId, taxId), isNull(clients.deletedAt)];
  if (excludeId) conditions.push(ne(clients.id, excludeId));
  const [existing] = await db
    .select({ id: clients.id, legalName: clients.legalName })
    .from(clients)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw new ConflictError(
      `Ya existe un cliente con la identificación ${taxId}: ${existing.legalName}`,
      { clientId: existing.id },
    );
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateClientInput;
  await assertNoDuplicate(input.taxId ?? null);

  const created = await db.transaction(async (tx) => {
    const code = await nextClientCode(tx);
    const [row] = await tx
      .insert(clients)
      .values({
        ...input,
        code,
        // Si no se indica ejecutivo, el creador queda como responsable.
        ownerId: input.ownerId ?? req.user!.id,
      })
      .returning();
    return row!;
  });

  await recordAudit({
    req,
    action: 'CREATE',
    entityType: 'CLIENT',
    entityId: created.id,
    entityLabel: created.legalName,
    module: 'clients',
    after: created,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findClientOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);

  const input = req.body as UpdateClientInput;
  if (input.taxId !== undefined) await assertNoDuplicate(input.taxId ?? null, existing.id);

  // Un ejecutivo no puede reasignar la cartera a otro usuario.
  if (input.ownerId !== undefined && !canSeeAllRecords(req, 'clients')) {
    delete input.ownerId;
  }

  const [updated] = await db
    .update(clients)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(clients.id, existing.id))
    .returning();

  const changes = diff(existing as unknown as Record<string, unknown>, input as Record<string, unknown>);
  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'CLIENT',
    entityId: existing.id,
    entityLabel: updated!.legalName,
    module: 'clients',
    before: changes.before,
    after: changes.after,
  });

  ok(res, updated);
}

async function changeStatus(
  req: Request,
  res: Response,
  status: 'ARCHIVADO' | 'ACTIVO',
  message: string,
): Promise<void> {
  const existing = await findClientOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);

  const [updated] = await db
    .update(clients)
    .set({ status, updatedAt: new Date() })
    .where(eq(clients.id, existing.id))
    .returning();

  await recordAudit({
    req,
    action: 'STATUS_CHANGE',
    entityType: 'CLIENT',
    entityId: existing.id,
    entityLabel: existing.legalName,
    module: 'clients',
    before: { status: existing.status },
    after: { status },
  });

  ok(res, { ...updated, message });
}

export const archive = (req: Request, res: Response) =>
  changeStatus(req, res, 'ARCHIVADO', 'Cliente archivado');

export const restore = (req: Request, res: Response) =>
  changeStatus(req, res, 'ACTIVO', 'Cliente reactivado');

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findClientOrFail(req.params.id!);

  // Regla de negocio: no se elimina un cliente con historial comercial.
  const [{ value: related }] = await db
    .select({
      value: sql<number>`(
        (SELECT COUNT(*) FROM opportunities o WHERE o.client_id = ${existing.id} AND o.deleted_at IS NULL) +
        (SELECT COUNT(*) FROM quotes q WHERE q.client_id = ${existing.id} AND q.deleted_at IS NULL) +
        (SELECT COUNT(*) FROM sales s WHERE s.client_id = ${existing.id} AND s.deleted_at IS NULL)
      )::int`,
    })
    .from(sql`(SELECT 1) AS t`);

  if (related > 0) {
    throw new ConflictError(
      'No se puede eliminar: el cliente tiene oportunidades, cotizaciones o ventas asociadas. Archívelo en su lugar.',
    );
  }

  await db
    .update(clients)
    .set({ deletedAt: new Date(), status: 'ARCHIVADO' })
    .where(eq(clients.id, existing.id));

  await recordAudit({
    req,
    action: 'DELETE',
    entityType: 'CLIENT',
    entityId: existing.id,
    entityLabel: existing.legalName,
    module: 'clients',
    before: existing,
  });

  noContent(res);
}
