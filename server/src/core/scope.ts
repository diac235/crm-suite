import { type SQL, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db';
import { canSeeAllRecords } from '../middlewares/auth';
import { ForbiddenError, UnauthorizedError } from './errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificador del usuario autenticado, validado antes de usarse en SQL. */
export function currentUserId(req: Request): string {
  const id = req.user?.id;
  if (!id || !UUID_PATTERN.test(id)) throw new UnauthorizedError('Sesión inválida');
  return id;
}

/**
 * Restringe los registros satélite (contactos, documentos, notas) a los
 * clientes, prospectos u oportunidades de la cartera del usuario.
 * Devuelve `undefined` cuando el usuario puede ver toda la información.
 */
export function relatedOwnershipScope(
  req: Request,
  module: string,
  columns: { clientId?: SQL | unknown; prospectId?: SQL | unknown; opportunityId?: SQL | unknown },
): SQL | undefined {
  if (canSeeAllRecords(req, module)) return undefined;
  const userId = currentUserId(req);

  const checks: SQL[] = [];
  if (columns.clientId) {
    checks.push(sql`EXISTS (
      SELECT 1 FROM clients oc
      WHERE oc.id = ${columns.clientId}
        AND (oc.owner_id = ${userId} OR oc.owner_id IS NULL)
    )`);
  }
  if (columns.prospectId) {
    checks.push(sql`EXISTS (
      SELECT 1 FROM prospects op
      WHERE op.id = ${columns.prospectId}
        AND (op.owner_id = ${userId} OR op.owner_id IS NULL)
    )`);
  }
  if (columns.opportunityId) {
    checks.push(sql`EXISTS (
      SELECT 1 FROM opportunities oo
      WHERE oo.id = ${columns.opportunityId}
        AND (oo.owner_id = ${userId} OR oo.owner_id IS NULL)
    )`);
  }

  if (checks.length === 0) return undefined;
  return sql`(${sql.join(checks, sql` OR `)})`;
}

/**
 * Verifica que el usuario pueda operar sobre los registros padre indicados.
 * Se usa al crear registros satélite (documentos, notas, actividades) para que
 * un ejecutivo no pueda adjuntar información a la cartera de otro.
 */
export async function assertRelatedOwnership(
  req: Request,
  module: string,
  refs: { clientId?: string | null; prospectId?: string | null; opportunityId?: string | null },
): Promise<void> {
  if (canSeeAllRecords(req, module)) return;
  const userId = currentUserId(req);

  const checks: Array<{ table: string; id: string }> = [];
  if (refs.clientId) checks.push({ table: 'clients', id: refs.clientId });
  if (refs.prospectId) checks.push({ table: 'prospects', id: refs.prospectId });
  if (refs.opportunityId) checks.push({ table: 'opportunities', id: refs.opportunityId });

  for (const check of checks) {
    const result = await db.execute(
      sql`SELECT owner_id AS "ownerId" FROM ${sql.identifier(check.table)} WHERE id = ${check.id} LIMIT 1`,
    );
    const row = (result as unknown as { rows: Array<{ ownerId: string | null }> }).rows[0];
    if (row && row.ownerId && row.ownerId !== userId) {
      throw new ForbiddenError('El registro pertenece a la cartera de otro ejecutivo');
    }
  }
}
