import type { Request, Response } from 'express';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { notes, users } from '../../db/schema';
import { ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { recordAudit } from '../../services/audit.service';
import { canSeeAllRecords } from '../../middlewares/auth';
import { assertRelatedOwnership, relatedOwnershipScope } from '../../core/scope';
import type { ListNotesQuery } from './notes.schema';

const selection = {
  id: notes.id,
  body: notes.body,
  isPinned: notes.isPinned,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
  clientId: notes.clientId,
  prospectId: notes.prospectId,
  opportunityId: notes.opportunityId,
  authorId: notes.authorId,
  authorName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
};

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListNotesQuery;
  const conditions = [isNull(notes.deletedAt)];
  if (query.clientId) conditions.push(eq(notes.clientId, query.clientId));
  if (query.prospectId) conditions.push(eq(notes.prospectId, query.prospectId));
  if (query.opportunityId) conditions.push(eq(notes.opportunityId, query.opportunityId));

  const scope = relatedOwnershipScope(req, 'notes', {
    clientId: notes.clientId,
    prospectId: notes.prospectId,
    opportunityId: notes.opportunityId,
  });
  if (scope) conditions.push(scope);

  const where = combine(...conditions, searchAcross([notes.body], query.search));

  const [rows, [total]] = await Promise.all([
    db
      .select(selection)
      .from(notes)
      .leftJoin(users, eq(notes.authorId, users.id))
      .where(where)
      .orderBy(desc(notes.isPinned), desc(notes.createdAt))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(notes).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(notes).where(and(eq(notes.id, id), isNull(notes.deletedAt))).limit(1);
  if (!row) throw new NotFoundError('Nota no encontrada');
  return row;
}

export async function create(req: Request, res: Response): Promise<void> {
  await assertRelatedOwnership(req, 'notes', req.body as Record<string, string | null>);

  const [created] = await db
    .insert(notes)
    .values({ ...(req.body as object), authorId: req.user!.id } as typeof notes.$inferInsert)
    .returning();

  await recordAudit({
    req, action: 'CREATE', entityType: 'NOTE', entityId: created!.id,
    entityLabel: created!.body.slice(0, 80), module: 'notes',
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  // Solo el autor o un administrador pueden editar una nota.
  if (existing.authorId !== req.user!.id && !canSeeAllRecords(req, 'notes')) {
    throw new ForbiddenError('Solo el autor puede modificar esta nota');
  }

  const [updated] = await db
    .update(notes)
    .set({ ...(req.body as object), updatedAt: new Date() })
    .where(eq(notes.id, existing.id))
    .returning();

  await recordAudit({
    req, action: 'UPDATE', entityType: 'NOTE', entityId: existing.id,
    entityLabel: updated!.body.slice(0, 80), module: 'notes',
  });

  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  if (existing.authorId !== req.user!.id && !canSeeAllRecords(req, 'notes')) {
    throw new ForbiddenError('Solo el autor puede eliminar esta nota');
  }
  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'NOTE', entityId: existing.id,
    entityLabel: existing.body.slice(0, 80), module: 'notes',
  });
  noContent(res);
}
