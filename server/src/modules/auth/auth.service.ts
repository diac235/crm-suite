import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { and, eq, gt, gte, isNull, lt, or } from 'drizzle-orm';
import { db } from '../../db';
import { rolePermissions, permissions, roles, sessions, users } from '../../db/schema';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../core/errors';
import type { AuthenticatedUser } from '../../core/types';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'crm-suite',
    audience: 'crm-web',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'crm-suite',
      audience: 'crm-web',
    }) as AccessTokenPayload;
    if (decoded.type !== 'access') throw new Error('tipo inválido');
    return decoded;
  } catch {
    throw new UnauthorizedError('Sesión inválida o expirada');
  }
}

function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    issuer: 'crm-suite',
    audience: 'crm-web',
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'crm-suite',
      audience: 'crm-web',
    }) as RefreshTokenPayload;
    if (decoded.type !== 'refresh') throw new Error('tipo inválido');
    return decoded;
  } catch {
    throw new UnauthorizedError('Sesión expirada, vuelva a iniciar sesión');
  }
}

/** Solo se persiste el hash del refresh token. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Margen de tolerancia para la rotación de refresh tokens.
 * Evita cerrar la sesión cuando dos pestañas renuevan simultáneamente,
 * sin renunciar a la detección de reutilización fuera de esa ventana.
 */
const ROTATION_GRACE_MS = 30_000;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function issueSession(
  user: { id: string; email: string; roleSlug: string },
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<IssuedSession> {
  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, sid: sessionId });
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.roleSlug,
  });

  return { accessToken, refreshToken, expiresAt };
}

/** Rotación de refresh token: la sesión anterior se revoca siempre. */
export async function rotateSession(
  oldToken: string,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<IssuedSession & { user: AuthenticatedUser }> {
  const payload = verifyRefreshToken(oldToken);
  const tokenHash = hashToken(oldToken);

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, payload.sid), eq(sessions.tokenHash, tokenHash)))
    .limit(1);

  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError('Sesión inválida, vuelva a iniciar sesión');
  }

  if (session.revokedAt) {
    // Solo se tolera la reutilización si la revocación fue una rotación
    // reciente Y existe la sesión sucesora que esa rotación creó. Así una
    // carrera entre pestañas no cierra la sesión, pero un token robado tras
    // un cierre de sesión o una revocación por compromiso sigue siendo inválido.
    const withinGrace = Date.now() - session.revokedAt.getTime() <= ROTATION_GRACE_MS;
    const successor = withinGrace
      ? await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, payload.sub),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, new Date()),
              gte(sessions.createdAt, new Date(session.revokedAt.getTime() - 1000)),
            ),
          )
          .limit(1)
      : [];

    if (!withinGrace || successor.length === 0) {
      await revokeAllSessions(payload.sub);
      throw new UnauthorizedError('Sesión inválida, vuelva a iniciar sesión');
    }
  }

  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));

  const user = await loadAuthenticatedUser(payload.sub);
  if (!user) throw new UnauthorizedError('Usuario no disponible');

  const issued = await issueSession(
    { id: user.id, email: user.email, roleSlug: user.roleSlug },
    meta,
  );
  return { ...issued, user };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Limpieza de sesiones caducadas o revocadas hace más de 30 días. */
export async function purgeExpiredSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, cutoff)));
}

/** Carga el usuario con su rol y permisos efectivos. */
export async function loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
      roleId: roles.id,
      roleSlug: roles.slug,
      roleLevel: roles.level,
      teamId: users.teamId,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row || !row.isActive || row.deletedAt) return null;

  const perms = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, row.roleId));

  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    roleId: row.roleId,
    roleSlug: row.roleSlug,
    roleLevel: row.roleLevel,
    teamId: row.teamId,
    permissions: perms.map((p) => p.code),
  };
}
