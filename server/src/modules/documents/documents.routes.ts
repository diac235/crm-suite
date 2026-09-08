import { Router, type NextFunction, type Request, type Response } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { translateMulterError, uploadDocument } from '../../middlewares/upload';
import { idParamSchema } from '../../core/validators';
import * as controller from './documents.controller';
import { listDocumentsSchema, uploadDocumentSchema } from './documents.schema';

export const documentsRouter: Router = Router();

documentsRouter.use(authenticate);

/** Envuelve multer para traducir sus errores al formato de la API. */
function handleUpload(req: Request, res: Response, next: NextFunction): void {
  uploadDocument.single('file')(req, res, (err: unknown) => {
    if (err) return next(translateMulterError(err));
    return next();
  });
}

documentsRouter.get('/', requirePermission('documents.read'), validate({ query: listDocumentsSchema }), asyncHandler(controller.list));
documentsRouter.get('/:id/download', requirePermission('documents.read'), validate({ params: idParamSchema }), asyncHandler(controller.download));
documentsRouter.post(
  '/',
  requirePermission('documents.create'),
  handleUpload,
  validate({ body: uploadDocumentSchema }),
  asyncHandler(controller.upload),
);
documentsRouter.delete('/:id', requirePermission('documents.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
