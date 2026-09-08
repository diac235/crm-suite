import type { Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import { permissions, rolePermissions, roles, users } from '../../db/schema';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok } from '../../core/http';
import { ALL_PERMISSIONS, MODULES } from '../../core/permissions';
import { optionalText, requiredText } from '../../core/validators';
import { recordAudit } from '../../services/audit.service';

export const createRoleSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Use solo minúsculas, números y guiones'),
  name: requiredText(80, 'El nombre del rol'),
  description: optionalText(300),
  level: z.coerce.number().int().min(1).max(999).default(100),
  permissions: z.array(z.string().max(80)).default([]),
});

export const updateRoleSchema = z.object({
  name: requiredText(80, 'El nombre del rol').optional(),
  description: optionalText(300),
  level: z.coerce.number().int().min(1).max(999).optional(),
  permissions: z.array(z.string().max(80)).optional(),
});

export async function catalog(_req: Request, res: Response): Promise<void> {
  const grouped = Object.entries(MODULES).map(([key, label]) => ({
    module: key,
    label,
    permissions: ALL_PERMISSIONS.filter((p) => p.module === key).map((p) => ({
      code: p.code,
      action: p.action,
      description: p.description,
    })),
  }));
  ok(res, grouped);
}

export async function list(_req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({
      id: roles.id,
      slug: roles.slug,
      name: roles.name,
      description: roles.description,
      level: roles.level,
      isSystem: roles.isSystem,
      createdAt: roles.createdAt,
      usersCount: sql<number>`(SELECT COUNT(*)::int FROM users u WHERE u.role_id = ${roles.id} AND u.deleted_at IS NULL)`,
      permissionsCount: sql<number>`(SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.role_id = ${roles.id})`,
    })
    .from(roles)
    .orderBy(asc(roles.level));
  ok(res, rows);
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!row) throw new NotFoundError('Rol no encontrado');
  return row;
}

export async function detail(req: Request, res: Response): Promise<void> {
  const role = await findOrFail(req.params.id!);
  const codes = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, role.id));
  ok(res, { ...role, permissions: codes.map((c) => c.code) });
}

async function syncPermissions(roleId: string, codes: string[]): Promise<string[]> {
  const valid = codes.filter((code) => ALL_PERMISSIONS.some((p) => p.code === code));
  if (valid.length !== codes.length) {
    throw new BadRequestError('Se enviaron permisos que no existen en el catálogo');
  }

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (valid.length === 0) return [];

  const rows = await db.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, valid));
  await db.insert(rolePermissions).values(rows.map((r) => ({ roleId, permissionId: r.id })));
  return rows.map((r) => r.code);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as z.infer<typeof createRoleSchema>;

  if (req.user!.roleLevel > input.level) {
    throw new ForbiddenError('No puede crear un rol con más privilegios que el suyo');
  }

  const [duplicate] = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, input.slug)).limit(1);
  if (duplicate) throw new ConflictError('Ya existe un rol con ese identificador');

  const [created] = await db
    .insert(roles)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      level: input.level,
      isSystem: false,
    })
    .returning();

  const applied = await syncPermissions(created!.id, input.permissions);

  await recordAudit({
    req, action: 'CREATE', entityType: 'ROLE', entityId: created!.id,
    entityLabel: created!.name, module: 'roles', after: { slug: created!.slug, permisos: applied.length },
  });

  ok(res, { ...created, permissions: applied }, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const role = await findOrFail(req.params.id!);
  const input = req.body as z.infer<typeof updateRoleSchema>;

  if (req.user!.roleLevel > role.level) {
    throw new ForbiddenError('No puede modificar un rol con más privilegios que el suyo');
  }
  if (role.slug === 'superadmin' && input.permissions) {
    throw new ForbiddenError('Los permisos del superadministrador no pueden modificarse');
  }

  const [updated] = await db
    .update(roles)
    .set({
      name: input.name ?? role.name,
      description: input.description ?? role.description,
      level: role.isSystem ? role.level : (input.level ?? role.level),
      updatedAt: new Date(),
    })
    .where(eq(roles.id, role.id))
    .returning();

  let applied: string[] | undefined;
  if (input.permissions) applied = await syncPermissions(role.id, input.permissions);

  await recordAudit({
    req, action: 'UPDATE', entityType: 'ROLE', entityId: role.id,
    entityLabel: updated!.name, module: 'roles',
    before: { nombre: role.name, nivel: role.level },
    after: { nombre: updated!.name, nivel: updated!.level, permisos: applied?.length },
  });

  ok(res, { ...updated, permissions: applied });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const role = await findOrFail(req.params.id!);
  if (role.isSystem) throw new ForbiddenError('Los roles del sistema no pueden eliminarse');

  const [{ value: assigned }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(and(eq(users.roleId, role.id)));

  if (assigned > 0) {
    throw new ConflictError(`No se puede eliminar: ${assigned} usuario(s) tienen este rol asignado`);
  }

  await db.delete(roles).where(eq(roles.id, role.id));
  await recordAudit({
    req, action: 'DELETE', entityType: 'ROLE', entityId: role.id,
    entityLabel: role.name, module: 'roles',
  });
  noContent(res);
}
