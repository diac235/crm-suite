import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { clients, contacts } from '../../db/schema';
import { NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { relatedOwnershipScope } from '../../core/scope';
import { canSeeAllRecords } from '../../middlewares/auth';
import { ForbiddenError } from '../../core/errors';
import type { CreateContactInput, ListContactsQuery, UpdateContactInput } from './contacts.schema';

const SORTABLE = {
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  position: contacts.position,
  email: contacts.email,
  createdAt: contacts.createdAt,
} as const;

const selection = {
  id: contacts.id,
  clientId: contacts.clientId,
  clientName: clients.legalName,
  clientCode: clients.code,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  position: contacts.position,
  department: contacts.department,
  email: contacts.email,
  phone: contacts.phone,
  mobile: contacts.mobile,
  whatsapp: contacts.whatsapp,
  birthDate: contacts.birthDate,
  isPrimary: contacts.isPrimary,
  isActive: contacts.isActive,
  notes: contacts.notes,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};

function buildFilters(req: Request, query: ListContactsQuery) {
  const conditions = [isNull(contacts.deletedAt), isNull(clients.deletedAt)];
  // Un ejecutivo solo ve los contactos de los clientes de su cartera.
  const scope = relatedOwnershipScope(req, 'contacts', { clientId: contacts.clientId });
  if (scope) conditions.push(scope);
  if (query.clientId) conditions.push(eq(contacts.clientId, query.clientId));
  if (query.isActive !== undefined) conditions.push(eq(contacts.isActive, query.isActive));
  if (query.isPrimary !== undefined) conditions.push(eq(contacts.isPrimary, query.isPrimary));
  const search = searchAcross(
    [contacts.firstName, contacts.lastName, contacts.email, contacts.mobile, contacts.position, clients.legalName],
    query.search,
  );
  return combine(...conditions, search);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListContactsQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'lastName');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    db
      .select(selection)
      .from(contacts)
      .innerJoin(clients, eq(contacts.clientId, clients.id))
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db
      .select({ value: count() })
      .from(contacts)
      .innerJoin(clients, eq(contacts.clientId, clients.id))
      .where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

export async function exportContacts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListContactsQuery & { format: 'xlsx' | 'csv' };
  const rows = await db
    .select(selection)
    .from(contacts)
    .innerJoin(clients, eq(contacts.clientId, clients.id))
    .where(buildFilters(req, query))
    .orderBy(asc(contacts.lastName))
    .limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'CONTACT', module: 'contacts', after: { registros: rows.length } });

  await sendExport(res, query.format, 'contactos', 'Contactos', [
    { header: 'Nombre', key: 'firstName', width: 20 },
    { header: 'Apellido', key: 'lastName', width: 20 },
    { header: 'Cliente', key: 'clientName', width: 36 },
    { header: 'Cargo', key: 'position', width: 24 },
    { header: 'Departamento', key: 'department', width: 22 },
    { header: 'Correo', key: 'email', width: 30 },
    { header: 'Teléfono', key: 'phone', width: 18 },
    { header: 'Celular', key: 'mobile', width: 18 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Principal', key: 'isPrimary', width: 12, value: (r) => (r.isPrimary ? 'Sí' : 'No') },
    { header: 'Activo', key: 'isActive', width: 12, value: (r) => (r.isActive ? 'Sí' : 'No') },
  ], rows);
}

/** Verifica que el contacto pertenezca a la cartera del usuario. */
async function assertCanAccess(req: Request, clientId: string): Promise<void> {
  if (canSeeAllRecords(req, 'contacts')) return;
  const [row] = await db
    .select({ ownerId: clients.ownerId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (row && row.ownerId && row.ownerId !== req.user!.id) {
    throw new ForbiddenError('El contacto pertenece a un cliente de otro ejecutivo');
  }
}

async function findOrFail(id: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Contacto no encontrado');
  return row;
}

async function assertClientExists(clientId: string): Promise<void> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('El cliente indicado no existe');
}

/** Solo puede existir un contacto principal por cliente. */
async function demoteOtherPrimaries(clientId: string, exceptId?: string): Promise<void> {
  const conditions = [eq(contacts.clientId, clientId), eq(contacts.isPrimary, true)];
  if (exceptId) conditions.push(ne(contacts.id, exceptId));
  await db.update(contacts).set({ isPrimary: false }).where(and(...conditions));
}

export async function detail(req: Request, res: Response): Promise<void> {
  const contact = await findOrFail(req.params.id!);
  await assertCanAccess(req, contact.clientId);
  const [row] = await db
    .select(selection)
    .from(contacts)
    .innerJoin(clients, eq(contacts.clientId, clients.id))
    .where(eq(contacts.id, contact.id))
    .limit(1);
  ok(res, row);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateContactInput;
  await assertClientExists(input.clientId);
  await assertCanAccess(req, input.clientId);

  const created = await db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(and(eq(contacts.clientId, input.clientId), eq(contacts.isPrimary, true)));
    }
    const [row] = await tx.insert(contacts).values(input).returning();
    return row!;
  });

  await recordAudit({
    req,
    action: 'CREATE',
    entityType: 'CONTACT',
    entityId: created.id,
    entityLabel: `${created.firstName} ${created.lastName}`,
    module: 'contacts',
    after: created,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  await assertCanAccess(req, existing.clientId);
  const input = req.body as UpdateContactInput;
  if (input.clientId) {
    await assertClientExists(input.clientId);
    await assertCanAccess(req, input.clientId);
  }
  if (input.isPrimary) await demoteOtherPrimaries(input.clientId ?? existing.clientId, existing.id);

  const [updated] = await db
    .update(contacts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(contacts.id, existing.id))
    .returning();

  const changes = diff(existing as unknown as Record<string, unknown>, input as Record<string, unknown>);
  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'CONTACT',
    entityId: existing.id,
    entityLabel: `${updated!.firstName} ${updated!.lastName}`,
    module: 'contacts',
    before: changes.before,
    after: changes.after,
  });

  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  await assertCanAccess(req, existing.clientId);
  await db.update(contacts).set({ deletedAt: new Date(), isActive: false }).where(eq(contacts.id, existing.id));
  await recordAudit({
    req,
    action: 'DELETE',
    entityType: 'CONTACT',
    entityId: existing.id,
    entityLabel: `${existing.firstName} ${existing.lastName}`,
    module: 'contacts',
    before: existing,
  });
  noContent(res);
}

/** Selector ligero usado por los formularios (cotizaciones, actividades...). */
export async function options(req: Request, res: Response): Promise<void> {
  const clientId = (req.query as { clientId?: string }).clientId;
  const rows = await db
    .select({
      id: contacts.id,
      label: sql<string>`CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})`,
      position: contacts.position,
      isPrimary: contacts.isPrimary,
    })
    .from(contacts)
    .where(
      combine(
        isNull(contacts.deletedAt),
        eq(contacts.isActive, true),
        clientId ? eq(contacts.clientId, clientId) : undefined,
        relatedOwnershipScope(req, 'contacts', { clientId: contacts.clientId }),
      ),
    )
    .orderBy(desc(contacts.isPrimary), asc(contacts.lastName))
    .limit(200);
  ok(res, rows);
}
