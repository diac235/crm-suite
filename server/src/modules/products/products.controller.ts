import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { products, taxRates } from '../../db/schema';
import { ConflictError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { diff, recordAudit } from '../../services/audit.service';
import { sendExport } from '../../services/export.service';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './products.schema';

const SORTABLE = {
  sku: products.sku,
  name: products.name,
  category: products.category,
  price: products.price,
  createdAt: products.createdAt,
} as const;

const selection = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  description: products.description,
  category: products.category,
  unit: products.unit,
  price: products.price,
  cost: products.cost,
  isActive: products.isActive,
  taxRateId: products.taxRateId,
  taxRateName: taxRates.name,
  taxRate: taxRates.rate,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

function buildFilters(query: ListProductsQuery) {
  const conditions = [isNull(products.deletedAt)];
  if (query.category) conditions.push(eq(products.category, query.category));
  if (query.isActive !== undefined) conditions.push(eq(products.isActive, query.isActive));
  return combine(...conditions, searchAcross([products.name, products.sku, products.category], query.search));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListProductsQuery;
  const where = buildFilters(query);
  const column = resolveSort(SORTABLE, query.sortBy, 'name');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    db
      .select(selection)
      .from(products)
      .leftJoin(taxRates, eq(products.taxRateId, taxRates.id))
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(products).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

export async function exportProducts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListProductsQuery & { format: 'xlsx' | 'csv' };
  const rows = await db
    .select(selection)
    .from(products)
    .leftJoin(taxRates, eq(products.taxRateId, taxRates.id))
    .where(buildFilters(query))
    .orderBy(asc(products.name))
    .limit(query.pageSize);

  await recordAudit({ req, action: 'EXPORT', entityType: 'PRODUCT', module: 'products', after: { registros: rows.length } });

  await sendExport(res, query.format, 'productos', 'Productos', [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Nombre', key: 'name', width: 40 },
    { header: 'Categoría', key: 'category', width: 20 },
    { header: 'Unidad', key: 'unit', width: 14 },
    { header: 'Precio', key: 'price', width: 14 },
    { header: 'Costo', key: 'cost', width: 14 },
    { header: 'Impuesto', key: 'taxRateName', width: 16 },
    { header: 'Activo', key: 'isActive', width: 10, value: (r) => (r.isActive ? 'Sí' : 'No') },
  ], rows);
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt))).limit(1);
  if (!row) throw new NotFoundError('Producto no encontrado');
  return row;
}

export async function detail(req: Request, res: Response): Promise<void> {
  await findOrFail(req.params.id!);
  const [row] = await db
    .select(selection)
    .from(products)
    .leftJoin(taxRates, eq(products.taxRateId, taxRates.id))
    .where(eq(products.id, req.params.id!))
    .limit(1);
  ok(res, row);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateProductInput;
  const [duplicate] = await db.select({ id: products.id }).from(products).where(eq(products.sku, input.sku)).limit(1);
  if (duplicate) throw new ConflictError(`Ya existe un producto con el SKU ${input.sku}`);

  const [created] = await db.insert(products).values(input).returning();
  await recordAudit({
    req, action: 'CREATE', entityType: 'PRODUCT', entityId: created!.id,
    entityLabel: created!.name, module: 'products', after: created,
  });
  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  const input = req.body as UpdateProductInput;

  if (input.sku && input.sku !== existing.sku) {
    const [duplicate] = await db.select({ id: products.id }).from(products).where(eq(products.sku, input.sku)).limit(1);
    if (duplicate) throw new ConflictError(`Ya existe un producto con el SKU ${input.sku}`);
  }

  const [updated] = await db
    .update(products)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(products.id, existing.id))
    .returning();

  const changes = diff(existing as unknown as Record<string, unknown>, input as Record<string, unknown>);
  await recordAudit({
    req, action: 'UPDATE', entityType: 'PRODUCT', entityId: existing.id,
    entityLabel: updated!.name, module: 'products', before: changes.before, after: changes.after,
  });
  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  const [{ value: used }] = await db
    .select({
      value: sql<number>`(
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.product_id = ${existing.id}) +
        (SELECT COUNT(*) FROM sale_items si WHERE si.product_id = ${existing.id})
      )::int`,
    })
    .from(sql`(SELECT 1) AS t`);

  if (used > 0) {
    // Se desactiva en lugar de eliminar para no romper documentos históricos.
    const [updated] = await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, existing.id))
      .returning();
    await recordAudit({
      req, action: 'STATUS_CHANGE', entityType: 'PRODUCT', entityId: existing.id,
      entityLabel: existing.name, module: 'products',
      after: { isActive: false, motivo: 'producto con historial comercial' },
    });
    ok(res, { ...updated, message: 'El producto tiene historial y fue desactivado en lugar de eliminarse' });
    return;
  }

  await db.update(products).set({ deletedAt: new Date(), isActive: false }).where(eq(products.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'PRODUCT', entityId: existing.id,
    entityLabel: existing.name, module: 'products', before: existing,
  });
  noContent(res);
}
