import type { Request, Response } from 'express';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { teams, users } from '../../db/schema';
import { ConflictError, NotFoundError } from '../../core/errors';
import { noContent, ok } from '../../core/http';
import { optionalText, optionalUuid, requiredText } from '../../core/validators';
import { recordAudit } from '../../services/audit.service';

export const createTeamSchema = z.object({
  name: requiredText(120, 'El nombre del equipo'),
  description: optionalText(300),
  leaderId: optionalUuid,
  isActive: z.coerce.boolean().default(true),
});

export const updateTeamSchema = createTeamSchema.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'Debe enviar al menos un campo',
});

export async function list(_req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      isActive: teams.isActive,
      leaderId: teams.leaderId,
      leaderName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
      membersCount: sql<number>`(SELECT COUNT(*)::int FROM users m WHERE m.team_id = ${teams.id} AND m.deleted_at IS NULL)`,
      createdAt: teams.createdAt,
    })
    .from(teams)
    .leftJoin(users, eq(teams.leaderId, users.id))
    .orderBy(asc(teams.name));
  ok(res, rows);
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  if (!row) throw new NotFoundError('Equipo no encontrado');
  return row;
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as z.infer<typeof createTeamSchema>;
  const [created] = await db.insert(teams).values(input).returning();
  await recordAudit({
    req, action: 'CREATE', entityType: 'TEAM', entityId: created!.id,
    entityLabel: created!.name, module: 'teams', after: created,
  });
  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  const [updated] = await db
    .update(teams)
    .set({ ...(req.body as object), updatedAt: new Date() })
    .where(eq(teams.id, existing.id))
    .returning();
  await recordAudit({
    req, action: 'UPDATE', entityType: 'TEAM', entityId: existing.id,
    entityLabel: updated!.name, module: 'teams', before: existing, after: updated,
  });
  ok(res, updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  const [{ value: members }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(eq(users.teamId, existing.id));
  if (members > 0) throw new ConflictError(`No se puede eliminar: el equipo tiene ${members} integrante(s)`);

  await db.delete(teams).where(eq(teams.id, existing.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'TEAM', entityId: existing.id,
    entityLabel: existing.name, module: 'teams',
  });
  noContent(res);
}
