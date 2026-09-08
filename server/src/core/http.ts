import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Envuelve handlers async para propagar errores al middleware central. */
export const asyncHandler =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function paginated<T>(res: Response, data: T[], meta: PageMeta): Response {
  return res.status(200).json({ success: true, data, meta });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}
