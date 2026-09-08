import type { Request, Response } from 'express';
import { z } from 'zod';
import { asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  activityTypes,
  pipelineStages,
  prospectSources,
  sectors,
  taxRates,
} from '../../db/schema';
import { ConflictError, NotFoundError } from '../../core/errors';
import { noContent, ok } from '../../core/http';
import { optionalText, requiredText } from '../../core/validators';
import { recordAudit } from '../../services/audit.service';

/** Catálogos simples de nombre + orden + estado. */
const SIMPLE_CATALOGS = {
  sectors: { table: sectors, label: 'Sector', usageColumn: 'sector_id', usageTables: ['clients', 'prospects'] },
  'prospect-sources': {
    table: prospectSources,
    label: 'Fuente de prospecto',
    usageColumn: 'source_id',
    usageTables: ['prospects', 'opportunities'],
  },
} as const;

type SimpleCatalogKey = keyof typeof SIMPLE_CATALOGS;

export const simpleCatalogSchema = z.object({
  name: requiredText(120, 'El nombre'),
  isActive: z.coerce.boolean().default(true),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export const catalogParamSchema = z.object({
  catalog: z.enum(['sectors', 'prospect-sources']),
});

export const catalogItemParamSchema = catalogParamSchema.extend({
  id: z.string().uuid(),
});

export async function listSimple(req: Request, res: Response): Promise<void> {
  const key = req.params.catalog as SimpleCatalogKey;
  const { table } = SIMPLE_CATALOGS[key];
  const rows = await db.select().from(table).orderBy(asc(table.order), asc(table.name));
  ok(res, rows);
}

export async function createSimple(req: Request, res: Response): Promise<void> {
  const key = req.params.catalog as SimpleCatalogKey;
  const { table, label } = SIMPLE_CATALOGS[key];
  const input = req.body as z.infer<typeof simpleCatalogSchema>;

  const [duplicate] = await db.select({ id: table.id }).from(table).where(eq(table.name, input.name)).limit(1);
  if (duplicate) throw new ConflictError(`Ya existe un registro con el nombre "${input.name}"`);

  const [created] = await db.insert(table).values(input).returning();
  await recordAudit({
    req, action: 'CREATE', entityType: 'CATALOG', entityId: created!.id,
    entityLabel: `${label}: ${created!.name}`, module: 'settings', after: created,
  });
  ok(res, created, 201);
}

export async function updateSimple(req: Request, res: Response): Promise<void> {
  const key = req.params.catalog as SimpleCatalogKey;
  const { table, label } = SIMPLE_CATALOGS[key];
  const id = req.params.id!;

  const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Registro de catálogo no encontrado');

  const input = req.body as Partial<z.infer<typeof simpleCatalogSchema>>;
  if (input.name) {
    const [duplicate] = await db
      .select({ id: table.id })
      .from(table)
      .where(sql`${table.name} = ${input.name} AND ${table.id} <> ${id}`)
      .limit(1);
    if (duplicate) throw new ConflictError(`Ya existe un registro con el nombre "${input.name}"`);
  }

  const [updated] = await db.update(table).set(input).where(eq(table.id, id)).returning();
  await recordAudit({
    req, action: 'UPDATE', entityType: 'CATALOG', entityId: id,
    entityLabel: `${label}: ${updated!.name}`, module: 'settings', before: existing, after: updated,
  });
  ok(res, updated);
}

export async function removeSimple(req: Request, res: Response): Promise<void> {
  const key = req.params.catalog as SimpleCatalogKey;
  const config = SIMPLE_CATALOGS[key];
  const id = req.params.id!;

  const [existing] = await db.select().from(config.table).where(eq(config.table.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Registro de catálogo no encontrado');

  // Se comprueba el uso antes de eliminar para no romper la integridad histórica.
  for (const usageTable of config.usageTables) {
    const result = await db.execute(
      sql`SELECT COUNT(*)::int AS total FROM ${sql.identifier(usageTable)} WHERE ${sql.identifier(config.usageColumn)} = ${id}`,
    );
    const total = Number((result as unknown as { rows: Array<{ total: number }> }).rows[0]?.total ?? 0);
    if (total > 0) {
      throw new ConflictError(
        `No se puede eliminar: hay ${total} registro(s) que usan este valor. Desactívelo en su lugar.`,
      );
    }
  }

  await db.delete(config.table).where(eq(config.table.id, id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'CATALOG', entityId: id,
    entityLabel: `${config.label}: ${existing.name}`, module: 'settings',
  });
  noContent(res);
}

// ---------------------------------------------------------------------------
// Tipos de actividad
// ---------------------------------------------------------------------------

export const activityTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Use solo mayúsculas, números y guion bajo'),
  name: requiredText(80, 'El nombre'),
  icon: optionalText(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido').default('#6366f1'),
  isActive: z.coerce.boolean().default(true),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export async function listActivityTypes(_req: Request, res: Response): Promise<void> {
  ok(res, await db.select().from(activityTypes).orderBy(asc(activityTypes.order), asc(activityTypes.name)));
}

export async function createActivityType(req: Request, res: Response): Promise<void> {
  const input = req.body as z.infer<typeof activityTypeSchema>;
  const [duplicate] = await db.select({ id: activityTypes.id }).from(activityTypes).where(eq(activityTypes.code, input.code)).limit(1);
  if (duplicate) throw new ConflictError(`Ya existe un tipo de actividad con el código ${input.code}`);

  const [created] = await db.insert(activityTypes).values(input).returning();
  await recordAudit({
    req, action: 'CREATE', entityType: 'CATALOG', entityId: created!.id,
    entityLabel: `Tipo de actividad: ${created!.name}`, module: 'settings', after: created,
  });
  ok(res, created, 201);
}

export async function updateActivityType(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const [existing] = await db.select().from(activityTypes).where(eq(activityTypes.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Tipo de actividad no encontrado');

  const [updated] = await db
    .update(activityTypes)
    .set(req.body as Partial<z.infer<typeof activityTypeSchema>>)
    .where(eq(activityTypes.id, id))
    .returning();

  await recordAudit({
    req, action: 'UPDATE', entityType: 'CATALOG', entityId: id,
    entityLabel: `Tipo de actividad: ${updated!.name}`, module: 'settings', before: existing, after: updated,
  });
  ok(res, updated);
}

// ---------------------------------------------------------------------------
// Etapas del pipeline
// ---------------------------------------------------------------------------

export const pipelineStageSchema = z
  .object({
    name: requiredText(80, 'El nombre de la etapa'),
    order: z.coerce.number().int().min(0).max(99).default(0),
    probability: z.coerce.number().int().min(0).max(100).default(0),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido').default('#6366f1'),
    isWon: z.coerce.boolean().default(false),
    isLost: z.coerce.boolean().default(false),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((d) => !(d.isWon && d.isLost), {
    message: 'Una etapa no puede ser ganada y perdida al mismo tiempo',
    path: ['isLost'],
  });

export async function listStages(_req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      order: pipelineStages.order,
      probability: pipelineStages.probability,
      color: pipelineStages.color,
      isWon: pipelineStages.isWon,
      isLost: pipelineStages.isLost,
      isActive: pipelineStages.isActive,
      opportunitiesCount: sql<number>`(SELECT COUNT(*)::int FROM opportunities o WHERE o.stage_id = ${pipelineStages.id} AND o.deleted_at IS NULL)`,
    })
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.order));
  ok(res, rows);
}

export async function createStage(req: Request, res: Response): Promise<void> {
  const input = req.body as z.infer<typeof pipelineStageSchema>;
  const [duplicate] = await db.select({ id: pipelineStages.id }).from(pipelineStages).where(eq(pipelineStages.name, input.name)).limit(1);
  if (duplicate) throw new ConflictError('Ya existe una etapa con ese nombre');

  const [created] = await db.insert(pipelineStages).values(input).returning();
  await recordAudit({
    req, action: 'CREATE', entityType: 'CATALOG', entityId: created!.id,
    entityLabel: `Etapa: ${created!.name}`, module: 'settings', after: created,
  });
  ok(res, created, 201);
}

export async function updateStage(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const [existing] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Etapa no encontrada');

  const [updated] = await db
    .update(pipelineStages)
    .set({ ...(req.body as object), updatedAt: new Date() })
    .where(eq(pipelineStages.id, id))
    .returning();

  await recordAudit({
    req, action: 'UPDATE', entityType: 'CATALOG', entityId: id,
    entityLabel: `Etapa: ${updated!.name}`, module: 'settings', before: existing, after: updated,
  });
  ok(res, updated);
}

export async function removeStage(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const [existing] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Etapa no encontrada');

  const [{ value: used }] = await db.execute(
    sql`SELECT COUNT(*)::int AS value FROM opportunities WHERE stage_id = ${id} AND deleted_at IS NULL`,
  ).then((r) => (r as unknown as { rows: Array<{ value: number }> }).rows);

  if (used > 0) {
    throw new ConflictError(`No se puede eliminar: ${used} oportunidad(es) están en esta etapa`);
  }

  const [{ value: remaining }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(pipelineStages)
    .where(ne(pipelineStages.id, id));
  if (remaining < 2) throw new ConflictError('El pipeline debe conservar al menos dos etapas');

  await db.delete(pipelineStages).where(eq(pipelineStages.id, id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'CATALOG', entityId: id,
    entityLabel: `Etapa: ${existing.name}`, module: 'settings',
  });
  noContent(res);
}

// ---------------------------------------------------------------------------
// Tarifas de impuestos
// ---------------------------------------------------------------------------

export const taxRateSchema = z.object({
  name: requiredText(80, 'El nombre'),
  rate: z.coerce.number().min(0).max(100),
  isDefault: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export async function listTaxRates(_req: Request, res: Response): Promise<void> {
  ok(res, await db.select().from(taxRates).orderBy(asc(taxRates.name)));
}

export async function createTaxRate(req: Request, res: Response): Promise<void> {
  const input = req.body as z.infer<typeof taxRateSchema>;
  const created = await db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(taxRates).set({ isDefault: false });
    const [row] = await tx
      .insert(taxRates)
      .values({ ...input, rate: input.rate.toFixed(3) })
      .returning();
    return row!;
  });
  await recordAudit({
    req, action: 'CREATE', entityType: 'CATALOG', entityId: created.id,
    entityLabel: `Impuesto: ${created.name}`, module: 'settings', after: created,
  });
  ok(res, created, 201);
}

export async function updateTaxRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const [existing] = await db.select().from(taxRates).where(eq(taxRates.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Tarifa de impuesto no encontrada');

  const input = req.body as Partial<z.infer<typeof taxRateSchema>>;
  const updated = await db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(taxRates).set({ isDefault: false }).where(ne(taxRates.id, id));
    const [row] = await tx
      .update(taxRates)
      .set({ ...input, rate: input.rate !== undefined ? input.rate.toFixed(3) : undefined })
      .where(eq(taxRates.id, id))
      .returning();
    return row!;
  });

  await recordAudit({
    req, action: 'UPDATE', entityType: 'CATALOG', entityId: id,
    entityLabel: `Impuesto: ${updated.name}`, module: 'settings', before: existing, after: updated,
  });
  ok(res, updated);
}

/** Catálogos públicos que los formularios necesitan para poblar sus selectores. */
export async function bootstrap(_req: Request, res: Response): Promise<void> {
  const [sectorRows, sourceRows, typeRows, stageRows, taxRows] = await Promise.all([
    db.select().from(sectors).where(eq(sectors.isActive, true)).orderBy(asc(sectors.order), asc(sectors.name)),
    db.select().from(prospectSources).where(eq(prospectSources.isActive, true)).orderBy(asc(prospectSources.order)),
    db.select().from(activityTypes).where(eq(activityTypes.isActive, true)).orderBy(asc(activityTypes.order)),
    db.select().from(pipelineStages).where(eq(pipelineStages.isActive, true)).orderBy(asc(pipelineStages.order)),
    db.select().from(taxRates).where(eq(taxRates.isActive, true)).orderBy(asc(taxRates.name)),
  ]);

  ok(res, {
    sectors: sectorRows,
    prospectSources: sourceRows,
    activityTypes: typeRows,
    pipelineStages: stageRows,
    taxRates: taxRows,
  });
}
