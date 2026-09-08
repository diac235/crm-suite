import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { roles, teams, users } from '../../db/schema';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { diff, recordAudit } from '../../services/audit.service';
import { hashPassword, revokeAllSessions } from '../auth/auth.service';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema';

const SORTABLE = {
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
} as const;

const selection = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  phone: users.phone,
  position: users.position,
  avatarUrl: users.avatarUrl,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  lockedUntil: users.lockedUntil,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  roleId: users.roleId,
  roleName: roles.name,
  roleSlug: roles.slug,
  roleLevel: roles.level,
  teamId: users.teamId,
  teamName: teams.name,
};

function baseQuery() {
  return db
    .select(selection)
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(teams, eq(users.teamId, teams.id));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListUsersQuery;
  const conditions = [isNull(users.deletedAt)];
  if (query.roleId) conditions.push(eq(users.roleId, query.roleId));
  if (query.teamId) conditions.push(eq(users.teamId, query.teamId));
  if (query.isActive !== undefined) conditions.push(eq(users.isActive, query.isActive));

  const where = combine(...conditions, searchAcross([users.firstName, users.lastName, users.email], query.search));
  const column = resolveSort(SORTABLE, query.sortBy, 'firstName');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(users).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

/** Listado ligero para selectores de responsable. */
export async function options(_req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({
      id: users.id,
      label: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
      email: users.email,
    })
    .from(users)
    .where(and(isNull(users.deletedAt), eq(users.isActive, true)))
    .orderBy(asc(users.firstName))
    .limit(500);
  ok(res, rows);
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
  if (!row) throw new NotFoundError('Usuario no encontrado');
  return row;
}

async function getRoleOrFail(roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new BadRequestError('El rol indicado no existe');
  return role;
}

/** Impide que un usuario asigne un rol con más privilegios que el suyo. */
function assertRoleAssignable(req: Request, roleLevel: number): void {
  if (req.user!.roleLevel > roleLevel) {
    throw new ForbiddenError('No puede asignar un rol con más privilegios que el suyo');
  }
}

export async function detail(req: Request, res: Response): Promise<void> {
  await findOrFail(req.params.id!);
  const [row] = await baseQuery().where(eq(users.id, req.params.id!)).limit(1);
  ok(res, row);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateUserInput;

  const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (duplicate) throw new ConflictError('Ya existe un usuario con ese correo electrónico');

  const role = await getRoleOrFail(input.roleId);
  assertRoleAssignable(req, role.level);

  const [created] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      position: input.position ?? null,
      roleId: input.roleId,
      teamId: input.teamId ?? null,
      isActive: input.isActive,
      mustChangePassword: input.mustChangePassword,
    })
    .returning({
      id: users.id, email: users.email, firstName: users.firstName,
      lastName: users.lastName, roleId: users.roleId, isActive: users.isActive,
    });

  await recordAudit({
    req, action: 'CREATE', entityType: 'USER', entityId: created!.id,
    entityLabel: created!.email, module: 'users',
    after: { email: created!.email, rol: role.slug, activo: created!.isActive },
  });

  ok(res, created, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  const input = req.body as UpdateUserInput;

  if (input.email && input.email !== existing.email) {
    const [duplicate] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, input.email), ne(users.id, existing.id)))
      .limit(1);
    if (duplicate) throw new ConflictError('Ya existe un usuario con ese correo electrónico');
  }

  if (input.roleId) {
    const role = await getRoleOrFail(input.roleId);
    assertRoleAssignable(req, role.level);
  }

  // Nadie puede desactivarse a sí mismo (evita quedarse fuera del sistema).
  if (input.isActive === false && existing.id === req.user!.id) {
    throw new BadRequestError('No puede desactivar su propia cuenta');
  }

  const [updated] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, existing.id))
    .returning(selection2());

  // Desactivar o cambiar de rol invalida las sesiones abiertas del usuario.
  if (input.isActive === false || (input.roleId && input.roleId !== existing.roleId)) {
    await revokeAllSessions(existing.id);
  }

  const changes = diff(existing as unknown as Record<string, unknown>, input as Record<string, unknown>);
  await recordAudit({
    req, action: 'UPDATE', entityType: 'USER', entityId: existing.id,
    entityLabel: existing.email, module: 'users', before: changes.before, after: changes.after,
  });

  ok(res, updated);
}

function selection2() {
  return {
    id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
    phone: users.phone, position: users.position, roleId: users.roleId, teamId: users.teamId,
    isActive: users.isActive, updatedAt: users.updatedAt,
  };
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  const { newPassword, mustChangePassword } = req.body as {
    newPassword: string;
    mustChangePassword: boolean;
  };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));

  await revokeAllSessions(existing.id);

  await recordAudit({
    req, action: 'UPDATE', entityType: 'USER', entityId: existing.id,
    entityLabel: existing.email, module: 'users',
    after: { evento: 'restablecimiento de contraseña por administrador' },
  });

  ok(res, { message: 'Contraseña restablecida. El usuario deberá iniciar sesión nuevamente.' });
}

export async function unlock(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, existing.id));
  await recordAudit({
    req, action: 'UPDATE', entityType: 'USER', entityId: existing.id,
    entityLabel: existing.email, module: 'users', after: { evento: 'cuenta desbloqueada' },
  });
  ok(res, { message: 'Cuenta desbloqueada' });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await findOrFail(req.params.id!);
  if (existing.id === req.user!.id) throw new BadRequestError('No puede eliminar su propia cuenta');

  // Se conserva la trazabilidad: baja lógica y correo liberado con sufijo.
  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      isActive: false,
      email: `${existing.email}.eliminado.${Date.now()}`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));

  await revokeAllSessions(existing.id);

  await recordAudit({
    req, action: 'DELETE', entityType: 'USER', entityId: existing.id,
    entityLabel: existing.email, module: 'users',
  });

  noContent(res);
}
