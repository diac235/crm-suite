import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import {
  clients,
  contacts,
  opportunities,
  products,
  quoteItems,
  quotes,
  saleItems,
  sales,
  taxRates,
  users,
} from '../../db/schema';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { computeLine, sumTotals } from '../../core/money';
import { nextQuoteNumber, nextSaleNumber } from '../../core/sequence';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import { streamQuotePdf } from '../../services/pdf.service';
import {
  getSetting,
  type CompanyProfile,
  type CurrencyConfig,
  type QuoteDefaults,
} from '../../services/settings.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import type {
  CreateQuoteInput,
  ListQuotesQuery,
  QuoteItemInput,
  UpdateQuoteInput,
} from './quotes.schema';

const SORTABLE = {
  number: quotes.number,
  issueDate: quotes.issueDate,
  validUntil: quotes.validUntil,
  total: quotes.total,
  status: quotes.status,
  createdAt: quotes.createdAt,
} as const;

const selection = {
  id: quotes.id,
  number: quotes.number,
  status: quotes.status,
  issueDate: quotes.issueDate,
  validUntil: quotes.validUntil,
  currency: quotes.currency,
  subtotal: quotes.subtotal,
  discountTotal: quotes.discountTotal,
  taxTotal: quotes.taxTotal,
  total: quotes.total,
  notes: quotes.notes,
  terms: quotes.terms,
  sentAt: quotes.sentAt,
  decisionAt: quotes.decisionAt,
  rejectionReason: quotes.rejectionReason,
  createdAt: quotes.createdAt,
  updatedAt: quotes.updatedAt,
  clientId: quotes.clientId,
  clientName: clients.legalName,
  clientTaxId: clients.taxId,
  contactId: quotes.contactId,
  contactName: sql<string | null>`NULLIF(TRIM(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})), '')`,
  opportunityId: quotes.opportunityId,
  opportunityName: opportunities.name,
  ownerId: quotes.ownerId,
  ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
};

function baseQuery() {
  return db
    .select(selection)
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .leftJoin(contacts, eq(quotes.contactId, contacts.id))
    .leftJoin(opportunities, eq(quotes.opportunityId, opportunities.id))
    .leftJoin(users, eq(quotes.ownerId, users.id));
}

function buildFilters(req: Request, query: ListQuotesQuery) {
  const conditions = [isNull(quotes.deletedAt)];
  if (query.status) conditions.push(eq(quotes.status, query.status));
  if (query.clientId) conditions.push(eq(quotes.clientId, query.clientId));
  if (query.opportunityId) conditions.push(eq(quotes.opportunityId, query.opportunityId));
  if (query.from) conditions.push(gte(quotes.issueDate, query.from));
  if (query.to) conditions.push(lte(quotes.issueDate, query.to));

  if (!canSeeAllRecords(req, 'quotes')) {
    conditions.push(or(eq(quotes.ownerId, req.user!.id), isNull(quotes.ownerId))!);
  } else if (query.ownerId) {
    conditions.push(eq(quotes.ownerId, query.ownerId));
  }

  return combine(...conditions, searchAcross([quotes.number, clients.legalName], query.search));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuotesQuery;
  const where = buildFilters(req, query);
  const column = resolveSort(SORTABLE, query.sortBy, 'issueDate');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(quotes).innerJoin(clients, eq(quotes.clientId, clients.id)).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

async function findOrFail(id: string) {
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), isNull(quotes.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError('Cotización no encontrada');
  return row;
}

function assertCanAccess(req: Request, ownerId: string | null): void {
  if (canSeeAllRecords(req, 'quotes')) return;
  if (ownerId && ownerId !== req.user!.id) {
    throw new ForbiddenError('La cotización pertenece a otro ejecutivo');
  }
}

async function loadItems(quoteId: string) {
  return db
    .select({
      id: quoteItems.id,
      productId: quoteItems.productId,
      productSku: products.sku,
      description: quoteItems.description,
      quantity: quoteItems.quantity,
      unitPrice: quoteItems.unitPrice,
      discountPct: quoteItems.discountPct,
      taxRateId: quoteItems.taxRateId,
      taxPct: quoteItems.taxPct,
      lineSubtotal: quoteItems.lineSubtotal,
      lineDiscount: quoteItems.lineDiscount,
      lineTax: quoteItems.lineTax,
      lineTotal: quoteItems.lineTotal,
      position: quoteItems.position,
    })
    .from(quoteItems)
    .leftJoin(products, eq(quoteItems.productId, products.id))
    .where(eq(quoteItems.quoteId, quoteId))
    .orderBy(asc(quoteItems.position));
}

export async function detail(req: Request, res: Response): Promise<void> {
  const quote = await findOrFail(req.params.id!);
  assertCanAccess(req, quote.ownerId);
  const [row] = await baseQuery().where(eq(quotes.id, quote.id)).limit(1);
  ok(res, { ...row, items: await loadItems(quote.id) });
}

/** Normaliza los ítems aplicando la tarifa de impuesto configurada. */
async function prepareItems(tx: Transaction, items: QuoteItemInput[]) {
  const taxRateIds = [...new Set(items.map((i) => i.taxRateId).filter((v): v is string => Boolean(v)))];
  const rates = taxRateIds.length
    ? await tx.select().from(taxRates).where(inArray(taxRates.id, taxRateIds))
    : [];
  const rateMap = new Map(rates.map((r) => [r.id, Number(r.rate)]));

  return items.map((item, index) => {
    const taxPct = item.taxRateId ? (rateMap.get(item.taxRateId) ?? item.taxPct) : item.taxPct;
    const totals = computeLine({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
      taxPct,
    });
    return {
      productId: item.productId ?? null,
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: item.unitPrice.toFixed(2),
      discountPct: String(item.discountPct),
      taxRateId: item.taxRateId ?? null,
      taxPct: String(taxPct),
      ...totals,
      position: index,
    };
  });
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateQuoteInput;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (!client) throw new BadRequestError('El cliente indicado no existe');

  const defaults = await getSetting<QuoteDefaults>('quotes.defaults');

  const created = await db.transaction(async (tx) => {
    const issueDate = input.issueDate ?? new Date();
    const number = await nextQuoteNumber(tx, issueDate.getFullYear());
    const preparedItems = await prepareItems(tx, input.items);
    const totals = sumTotals(preparedItems);

    const [quote] = await tx
      .insert(quotes)
      .values({
        number,
        clientId: input.clientId,
        contactId: input.contactId ?? null,
        opportunityId: input.opportunityId ?? null,
        ownerId: input.ownerId ?? req.user!.id,
        status: 'BORRADOR',
        issueDate,
        validUntil: input.validUntil,
        currency: input.currency,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        notes: input.notes ?? null,
        terms: input.terms ?? defaults.terms,
      })
      .returning();

    await tx.insert(quoteItems).values(preparedItems.map((i) => ({ ...i, quoteId: quote!.id })));
    return quote!;
  });

  await recordAudit({
    req, action: 'CREATE', entityType: 'QUOTE', entityId: created.id,
    entityLabel: created.number, module: 'quotes', after: created,
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);

  if (existing.status === 'ACEPTADA') {
    throw new ConflictError('Una cotización aceptada no puede modificarse');
  }

  const input = req.body as UpdateQuoteInput;
  const { items, ...header } = input;

  const updated = await db.transaction(async (tx) => {
    let totals = {
      subtotal: existing.subtotal,
      discountTotal: existing.discountTotal,
      taxTotal: existing.taxTotal,
      total: existing.total,
    };

    if (items) {
      const preparedItems = await prepareItems(tx, items);
      totals = sumTotals(preparedItems);
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, existing.id));
      await tx.insert(quoteItems).values(preparedItems.map((i) => ({ ...i, quoteId: existing.id })));
    }

    const [row] = await tx
      .update(quotes)
      .set({ ...header, ...totals, updatedAt: new Date() })
      .where(eq(quotes.id, existing.id))
      .returning();
    return row!;
  });

  const changes = diff(existing as unknown as Record<string, unknown>, header as Record<string, unknown>);
  await recordAudit({
    req, action: 'UPDATE', entityType: 'QUOTE', entityId: existing.id,
    entityLabel: existing.number, module: 'quotes',
    before: changes.before,
    after: { ...changes.after, itemsActualizados: Boolean(items) },
  });

  ok(res, updated);
}

/** Transiciones de estado permitidas. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ['ENVIADA', 'RECHAZADA'],
  ENVIADA: ['EN_NEGOCIACION', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  EN_NEGOCIACION: ['ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  VENCIDA: ['ENVIADA', 'EN_NEGOCIACION'],
  ACEPTADA: [],
  RECHAZADA: ['EN_NEGOCIACION'],
};

export async function changeStatus(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  assertCanAccess(req, existing.ownerId);

  const { status, rejectionReason } = req.body as { status: string; rejectionReason?: string | null };

  if (status === existing.status) {
    ok(res, existing);
    return;
  }

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(status)) {
    throw new ConflictError(`No se permite pasar de ${existing.status} a ${status}`);
  }
  if (status === 'RECHAZADA' && !rejectionReason) {
    throw new BadRequestError('Debe indicar el motivo del rechazo');
  }

  const now = new Date();
  const [updated] = await db
    .update(quotes)
    .set({
      status: status as typeof existing.status,
      sentAt: status === 'ENVIADA' ? (existing.sentAt ?? now) : existing.sentAt,
      decisionAt: status === 'ACEPTADA' || status === 'RECHAZADA' ? now : existing.decisionAt,
      rejectionReason: status === 'RECHAZADA' ? (rejectionReason ?? null) : null,
      updatedAt: now,
    })
    .where(eq(quotes.id, existing.id))
    .returning();

  await recordAudit({
    req, action: 'STATUS_CHANGE', entityType: 'QUOTE', entityId: existing.id,
    entityLabel: existing.number, module: 'quotes',
    before: { status: existing.status }, after: { status, rejectionReason },
  });

  ok(res, updated);
}

/** Convierte una cotización aceptada en una venta registrada. */
export async function convertToSale(req: Request, res: Response): Promise<void> {
  const quote = await findOrFail(req.params.id!);
  assertCanAccess(req, quote.ownerId);

  if (quote.status !== 'ACEPTADA') {
    throw new ConflictError('Solo se puede generar una venta desde una cotización aceptada');
  }

  const [existingSale] = await db.select({ id: sales.id }).from(sales).where(eq(sales.quoteId, quote.id)).limit(1);
  if (existingSale) throw new ConflictError('Esta cotización ya generó una venta');

  const items = await loadItems(quote.id);

  const sale = await db.transaction(async (tx) => {
    const number = await nextSaleNumber(tx, new Date().getFullYear());
    const [row] = await tx
      .insert(sales)
      .values({
        number,
        clientId: quote.clientId,
        opportunityId: quote.opportunityId,
        quoteId: quote.id,
        ownerId: quote.ownerId,
        status: 'PENDIENTE',
        saleDate: new Date(),
        currency: quote.currency,
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        total: quote.total,
        notes: `Generada desde la cotización ${quote.number}`,
      })
      .returning();

    await tx.insert(saleItems).values(
      items.map((item) => ({
        saleId: row!.id,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    );

    return row!;
  });

  await recordAudit({
    req, action: 'CONVERT', entityType: 'QUOTE', entityId: quote.id,
    entityLabel: quote.number, module: 'quotes',
    after: { ventaId: sale.id, ventaNumero: sale.number },
  });

  ok(res, sale, 201);
}

export async function pdf(req: Request, res: Response): Promise<void> {
  const quote = await findOrFail(req.params.id!);
  assertCanAccess(req, quote.ownerId);

  const [row] = await baseQuery().where(eq(quotes.id, quote.id)).limit(1);
  const [clientRow] = await db.select().from(clients).where(eq(clients.id, quote.clientId)).limit(1);
  const contactRow = quote.contactId
    ? (await db.select().from(contacts).where(eq(contacts.id, quote.contactId)).limit(1))[0]
    : undefined;
  const items = await loadItems(quote.id);

  const company = await getSetting<CompanyProfile>('company.profile');
  const currency = await getSetting<CurrencyConfig>('finance.currency');

  await recordAudit({
    req, action: 'DOWNLOAD', entityType: 'QUOTE', entityId: quote.id,
    entityLabel: quote.number, module: 'quotes', after: { formato: 'PDF' },
  });

  streamQuotePdf(
    res,
    {
      number: quote.number,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      status: quote.status,
      currency: quote.currency,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      notes: quote.notes,
      terms: quote.terms,
      ownerName: row?.ownerName ?? null,
      client: {
        legalName: clientRow!.legalName,
        tradeName: clientRow!.tradeName,
        taxId: clientRow!.taxId,
        address: clientRow!.address,
        city: clientRow!.city,
        phone: clientRow!.phone,
        email: clientRow!.email,
      },
      contact: contactRow
        ? {
            name: `${contactRow.firstName} ${contactRow.lastName}`,
            email: contactRow.email,
            phone: contactRow.mobile ?? contactRow.phone,
          }
        : null,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPct: i.discountPct,
        taxPct: i.taxPct,
        lineTotal: i.lineTotal,
      })),
    },
    company,
    currency,
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  if (existing.status === 'ACEPTADA') {
    throw new ConflictError('No se puede eliminar una cotización aceptada');
  }
  await db.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'QUOTE', entityId: existing.id,
    entityLabel: existing.number, module: 'quotes', before: existing,
  });
  noContent(res);
}

export async function exportQuotes(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuotesQuery & { format: 'xlsx' | 'csv' };
  const rows = await baseQuery().where(buildFilters(req, query)).orderBy(desc(quotes.issueDate)).limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'QUOTE', module: 'quotes', after: { registros: rows.length } });

  await sendExport(res, query.format, 'cotizaciones', 'Cotizaciones', [
    { header: 'Número', key: 'number', width: 20 },
    { header: 'Cliente', key: 'clientName', width: 38 },
    { header: 'Contacto', key: 'contactName', width: 26 },
    { header: 'Oportunidad', key: 'opportunityName', width: 30 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Emisión', key: 'issueDate', width: 20 },
    { header: 'Vigencia', key: 'validUntil', width: 20 },
    { header: 'Subtotal', key: 'subtotal', width: 14 },
    { header: 'Descuentos', key: 'discountTotal', width: 14 },
    { header: 'Impuestos', key: 'taxTotal', width: 14 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Ejecutivo', key: 'ownerName', width: 26 },
  ], rows);
}
