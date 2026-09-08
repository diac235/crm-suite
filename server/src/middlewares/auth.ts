import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../core/errors';
import { loadAuthenticatedUser, verifyAccessToken } from '../modules/auth/auth.service';
import { SYSTEM_ROLES } from '../core/permissions';

/** Exige un access token válido y carga permisos actualizados desde la base. */
export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Debe iniciar sesión para continuar');
    }
    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedError('Token no proporcionado');

    const payload = verifyAccessToken(token);
    // Se releen permisos y estado en cada petición: revocar un rol surte efecto inmediato.
    const user = await loadAuthenticatedUser(payload.sub);
    if (!user) throw new UnauthorizedError('La cuenta no está activa');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function hasPermission(req: Request, code: string): boolean {
  if (!req.user) return false;
  if (req.user.roleSlug === SYSTEM_ROLES.SUPERADMIN) return true;
  return req.user.permissions.includes(code);
}

/** Exige al menos uno de los permisos indicados. */
export function requirePermission(...codes: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (codes.some((code) => hasPermission(req, code))) return next();
    return next(new ForbiddenError(`Requiere el permiso: ${codes.join(' o ')}`));
  };
}

/** Restringe a roles concretos (por slug). */
export function requireRole(...slugs: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (slugs.includes(req.user.roleSlug)) return next();
    return next(new ForbiddenError('Su rol no permite esta operación'));
  };
}

/**
 * Indica si el usuario puede ver registros ajenos.
 * Los ejecutivos sin permiso de administración solo ven su propia cartera.
 */
export function canSeeAllRecords(req: Request, module: string): boolean {
  if (!req.user) return false;
  if (req.user.roleSlug === SYSTEM_ROLES.SUPERADMIN) return true;
  return req.user.permissions.includes(`${module}.delete`) || req.user.roleLevel <= 10;
}
