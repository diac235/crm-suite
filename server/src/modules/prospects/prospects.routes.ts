import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './prospects.controller';
import {
  convertProspectSchema,
  createProspectSchema,
  exportProspectsSchema,
  listProspectsSchema,
  updateProspectSchema,
} from './prospects.schema';

export const prospectsRouter: Router = Router();

prospectsRouter.use(authenticate);

prospectsRouter.get('/', requirePermission('prospects.read'), validate({ query: listProspectsSchema }), asyncHandler(controller.list));
prospectsRouter.get('/export', requirePermission('prospects.export'), heavyLimiter, validate({ query: exportProspectsSchema }), asyncHandler(controller.exportProspects));
prospectsRouter.get('/:id', requirePermission('prospects.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
prospectsRouter.post('/', requirePermission('prospects.create'), validate({ body: createProspectSchema }), asyncHandler(controller.create));
prospectsRouter.patch('/:id', requirePermission('prospects.update'), validate({ params: idParamSchema, body: updateProspectSchema }), asyncHandler(controller.update));
prospectsRouter.post(
  '/:id/convert',
  requirePermission('clients.create'),
  validate({ params: idParamSchema, body: convertProspectSchema }),
  asyncHandler(controller.convert),
);
prospectsRouter.delete('/:id', requirePermission('prospects.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
