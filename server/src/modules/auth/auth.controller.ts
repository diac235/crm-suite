import type { CookieOptions, Request, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { roles, users } from '../../db/schema';
import { env } from '../../config/env';
import { ok } from '../../core/http';
import { UnauthorizedError } from '../../core/errors';
import { clientIp, recordAudit } from '../../services/audit.service';
import type { ChangePasswordInput, LoginInput, UpdateProfileInput } from './auth.schema';
import {
  hashPassword,
  issueSession,
  loadAuthenticatedUser,
  revokeAllSessions,
  revokeSessionByToken,
  rotateSession,
  verifyPassword,
} from './auth.service';

const REFRESH_COOKIE = 'crm_rt';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    // SameSite=strict evita que la cookie viaje en peticiones de terceros (protección CSRF).
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}

function sessionMeta(req: Request) {
  return { userAgent: req.headers['user-agent'] ?? null, ipAddress: clientIp(req) };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
      mustChangePassword: users.mustChangePassword,
      roleSlug: roles.slug,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, email))
    .limit(1);

  // Respuesta uniforme: no se revela si el correo existe.
  const genericError = new UnauthorizedError('Credenciales incorrectas');

  if (!row || row.deletedAt) {
    await recordAudit({
      req,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      module: 'auth',
      userEmail: email,
      after: { motivo: 'usuario inexistente' },
    });
    throw genericError;
  }

  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    throw new UnauthorizedError(
      'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.',
    );
  }

  const valid = await verifyPassword(password, row.passwordHash);

  if (!valid) {
    const attempts = row.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.MAX_LOGIN_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + env.LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, row.id));

    await recordAudit({
      req,
      userId: row.id,
      userEmail: row.email,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: row.id,
      module: 'auth',
      after: { intentos: attempts, bloqueado: shouldLock },
    });
    throw genericError;
  }

  if (!row.isActive) {
    throw new UnauthorizedError('Su cuenta está desactivada. Contacte al administrador.');
  }

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, row.id));

  const session = await issueSession(
    { id: row.id, email: row.email, roleSlug: row.roleSlug },
    sessionMeta(req),
  );
  const user = await loadAuthenticatedUser(row.id);

  await recordAudit({
    req,
    userId: row.id,
    userEmail: row.email,
    action: 'LOGIN',
    entityType: 'USER',
    entityId: row.id,
    entityLabel: row.email,
    module: 'auth',
  });

  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
  ok(res, {
    accessToken: session.accessToken,
    user,
    mustChangePassword: row.mustChangePassword,
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? undefined;
  if (!token) throw new UnauthorizedError('No hay sesión activa');

  const result = await rotateSession(token, sessionMeta(req));
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
  ok(res, { accessToken: result.accessToken, user: result.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (token) await revokeSessionByToken(token);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  if (req.user) {
    await recordAudit({
      req,
      action: 'LOGOUT',
      entityType: 'USER',
      entityId: req.user.id,
      entityLabel: req.user.email,
      module: 'auth',
    });
  }
  ok(res, { message: 'Sesión cerrada' });
}

export async function me(req: Request, res: Response): Promise<void> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      position: users.position,
      avatarUrl: users.avatarUrl,
      teamId: users.teamId,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(and(eq(users.id, req.user!.id), isNull(users.deletedAt)))
    .limit(1);

  ok(res, { ...row, role: { id: req.user!.roleId, slug: req.user!.roleSlug }, permissions: req.user!.permissions });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const input = req.body as UpdateProfileInput;
  const [updated] = await db
    .update(users)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      position: input.position ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, req.user!.id))
    .returning({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      position: users.position,
    });

  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'USER',
    entityId: req.user!.id,
    entityLabel: req.user!.email,
    module: 'auth',
    after: input,
  });

  ok(res, updated);
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, req.user!.id))
    .limit(1);

  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    throw new UnauthorizedError('La contraseña actual es incorrecta');
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, req.user!.id));

  // Cambiar la contraseña invalida todas las sesiones abiertas.
  await revokeAllSessions(req.user!.id);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'USER',
    entityId: req.user!.id,
    entityLabel: req.user!.email,
    module: 'auth',
    after: { evento: 'cambio de contraseña' },
  });

  ok(res, { message: 'Contraseña actualizada. Vuelva a iniciar sesión.' });
}
