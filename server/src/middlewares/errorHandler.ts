import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from '../core/errors';
import { logger } from '../config/logger';
import { env } from '../config/env';

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

function mapDatabaseError(err: PgError): AppError | null {
  switch (err.code) {
    case '23505':
      return new AppError(
        'Ya existe un registro con esos datos únicos',
        409,
        'DUPLICADO',
        env.isProduction ? undefined : { constraint: err.constraint },
      );
    case '23503':
      return new AppError(
        'La operación viola una relación existente. Verifique los registros asociados.',
        409,
        'INTEGRIDAD_REFERENCIAL',
      );
    case '23502':
      return new AppError('Falta un campo obligatorio', 422, 'CAMPO_REQUERIDO');
    case '22P02':
      return new AppError('Formato de identificador inválido', 400, 'FORMATO_INVALIDO');
    default:
      return null;
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next: NextFunction) => {
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError('Datos inválidos', 422, 'VALIDACION', err.issues);
  } else if (err instanceof Error) {
    appError = mapDatabaseError(err as PgError) ?? new AppError(err.message);
  } else {
    appError = new AppError('Error interno del servidor');
  }

  const isServerError = appError.statusCode >= 500;

  if (isServerError) {
    logger.error(
      { err, path: req.originalUrl, method: req.method, userId: req.user?.id },
      'Error no controlado',
    );
  } else {
    logger.warn(
      { code: appError.code, path: req.originalUrl, method: req.method, userId: req.user?.id },
      appError.message,
    );
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      // Nunca se expone el detalle técnico de un 500 al cliente.
      message: isServerError ? 'Ocurrió un error interno. Intente nuevamente.' : appError.message,
      details: isServerError ? undefined : appError.details,
    },
  });
};
