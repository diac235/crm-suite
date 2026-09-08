import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './clients.controller';
import {
  createClientSchema,
  exportClientsSchema,
  listClientsSchema,
  updateClientSchema,
} from './clients.schema';

export const clientsRouter: Router = Router();

clientsRouter.use(authenticate);

clientsRouter.get(
  '/',
  requirePermission('clients.read'),
  validate({ query: listClientsSchema }),
  asyncHandler(controller.list),
);

clientsRouter.get(
  '/export',
  requirePermission('clients.export'),
  heavyLimiter,
  validate({ query: exportClientsSchema }),
  asyncHandler(controller.exportClients),
);

clientsRouter.get(
  '/:id',
  requirePermission('clients.read'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.detail),
);

clientsRouter.get(
  '/:id/summary',
  requirePermission('clients.read'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.summary),
);

clientsRouter.get(
  '/:id/timeline',
  requirePermission('clients.read'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.timeline),
);

clientsRouter.post(
  '/',
  requirePermission('clients.create'),
  validate({ body: createClientSchema }),
  asyncHandler(controller.create),
);

clientsRouter.patch(
  '/:id',
  requirePermission('clients.update'),
  validate({ params: idParamSchema, body: updateClientSchema }),
  asyncHandler(controller.update),
);

clientsRouter.post(
  '/:id/archive',
  requirePermission('clients.update'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.archive),
);

clientsRouter.post(
  '/:id/restore',
  requirePermission('clients.update'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.restore),
);

clientsRouter.delete(
  '/:id',
  requirePermission('clients.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);
