import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { clients, opportunities, products, quotes, saleItems, sales, users } from '../../db/schema';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { nextSaleNumber } from '../../core/sequence';
import { round2 } from '../../core/money';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import type { CreateSaleInput, ListSalesQuery, UpdateSaleInput } from './sales.schema';

const SORTABLE = {
  number: sales.number,
  saleDate: sales.saleDate,
  total: sales.total,
  status: sales.status,
  createdAt: sales.createdAt,
} as const;

const selection = {
  id: sales.id,
  number: sales.number,
  status: sales.status,
  saleDate: sales.saleDate,
  currency: sales.currency,
  subtotal: sales.subtotal,
  taxTotal: sales.taxTotal,
  total: sales.total,
  notes: sales.notes,
  createdAt: sales.createdAt,
  updatedAt: sales.updatedAt,
  clientId: sales.clientId,
  clientName: clients.legalName,
  opportunityId: sales.opportunityId,
  opportunityName: opportunities.name,
  quoteId: sales.quoteId,
  quoteNumber: quotes.number,
  ownerId: sales.ownerId,
  ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
};

function baseQuery() {
  return db
    .select(selection)
    .from(sales)
    .innerJoin(clients, eq(sales.clientId, clients.id))
    .leftJoin(opportunities, eq(sales.opportunityId, opportunities.id))
    .leftJoin(quotes, eq(sales.quoteId, quotes.id))
    .leftJoin(users, eq(sales.ownerId, users.id));
}

function buildFilters(req: Request, query: ListSalesQuery) {
  const conditions = [isNull(sales.deletedAt)];
  if (query.status) conditions.push(eq(sales.status, query.status));
  if (query.clientId) conditions.push(eq(sales.clientId, query.clientId));
  if (query.from) conditions.push(gte(sales.saleDate, query.from));
  if (query.to) conditions.push(lte(sales.saleDate, query.to));

  if (!canSeeAllRecords(req, 'sales')) {
    conditions.push(or(eq(sales.ownerId, req.user!.id), isNull(sales.ownerId))!);
  } else if (query.ownerId) {
    conditions.push(eq(sales.ownerId, query.ownerId));
  }

  return combine(...conditions, searchAcross([sales.number, clients.legalName], query.search));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListSalesQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'saleDate');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(sales).innerJoin(clients, eq(sales.clientId, clients.id)).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(sales).where(and(eq(sales.id, id), isNull(sales.deletedAt))).limit(1);
  if (!row) throw new NotFoundError('Venta no encontrada');
  return row;
}

function assertCanAccess(req: Request, ownerId: string | null): void {
  if (canSeeAllRecords(req, 'sales')) return;
  if (ownerId && ownerId !== req.user!.id) throw new ForbiddenError('La venta pertenece a otro ejecutivo');
}

export async function detail(req: Request, res: Response): Promise<void> {
  const sale = await findOrFail(req.params.id!);
  assertCanAccess(req, sale.ownerId);
  const [row] = await baseQuery().where(eq(sales.id, sale.id)).limit(1);
  const items = await db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productSku: products.sku,
      description: saleItems.description,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      lineTotal: saleItems.lineTotal,
    })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, sale.id));
  ok(res, { ...row, items });
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateSaleInput;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (!client) throw new BadRequestError('El cliente indicado no existe');

  const preparedItems = input.items.map((item) => ({
    productId: item.productId ?? null,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: item.unitPrice.toFixed(2),
    lineTotal: round2(item.quantity * item.unitPrice),
  }));

  const subtotal = preparedItems.reduce((acc, i) => acc + Number(i.lineTotal), 0);
  const taxTotal = input.taxTotal;
  const total = subtotal + taxTotal;

  const created = await db.transaction(async (tx) => {
    const saleDate = input.saleDate ?? new Date();
    const number = await nextSaleNumber(tx, saleDate.getFullYear());
    const [row] = await tx
      .insert(sales)
      .values({
        number,
        clientId: input.clientId,
        opportunityId: input.opportunityId ?? null,
        quoteId: input.quoteId ?? null,
        ownerId: input.ownerId ?? req.user!.id,
        status: 'PENDIENTE',
        saleDate,
        currency: input.currency,
        subtotal: round2(subtotal),
        taxTotal: round2(taxTotal),
        total: round2(total),
        notes: input.notes ?? null,
      })
      .returning();

    await tx.insert(saleItems).values(preparedItems.map((i) => ({ ...i, saleId: row!.id })));
    return row!;
  });

  await recordAudit({
    req, action: 'CREATE', entityType: 'SALE', entityId: created.id,
    entityLabel: created.number, module: 'sales', after: created,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);
  const input = req.body as UpdateSaleInput;

  if (existing.status === 'ANULADA') throw new ConflictError('Una venta anulada no puede modificarse');
  const patch: Record<string, unknown> = { ...input };
  if (patch.ownerId !== undefined && !canSeeAllRecords(req, 'sales')) delete patch.ownerId;

  const [updated] = await db
    .update(sales)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(sales.id, existing.id))
    .returning();

  const changes = diff(existing as unknown as Record<string, unknown>, patch);
  await recordAudit({
    req,
    action: input.status && input.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'SALE', entityId: existing.id, entityLabel: existing.number, module: 'sales',
    before: changes.before, after: changes.after,
  });

  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  await db.update(sales).set({ deletedAt: new Date(), status: 'ANULADA' }).where(eq(sales.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'SALE', entityId: existing.id,
    entityLabel: existing.number, module: 'sales', before: existing,
  });
  noContent(res);
}

export async function exportSales(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListSalesQuery & { format: 'xlsx' | 'csv' };
  const rows = await baseQuery().where(buildFilters(req, query)).orderBy(desc(sales.saleDate)).limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'SALE', module: 'sales', after: { registros: rows.length } });

  await sendExport(res, query.format, 'ventas', 'Ventas', [
    { header: 'Número', key: 'number', width: 20 },
    { header: 'Cliente', key: 'clientName', width: 38 },
    { header: 'Cotización', key: 'quoteNumber', width: 20 },
    { header: 'Oportunidad', key: 'opportunityName', width: 30 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Fecha', key: 'saleDate', width: 20 },
    { header: 'Subtotal', key: 'subtotal', width: 14 },
    { header: 'Impuestos', key: 'taxTotal', width: 14 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Ejecutivo', key: 'ownerName', width: 26 },
  ], rows);
}
