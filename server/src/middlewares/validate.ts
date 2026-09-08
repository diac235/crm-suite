import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '../core/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(raíz)',
    message: issue.message,
  }));
}

/**
 * Valida y normaliza `body`, `query` y `params` con Zod.
 * Todo lo que llega a los controladores está tipado y saneado.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // req.query es un getter en Express 5; se reemplaza de forma segura.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new ValidationError('Los datos enviados no son válidos', formatIssues(error)));
        return;
      }
      next(error);
    }
  };
}
