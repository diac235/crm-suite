import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './opportunities.controller';
import {
  createOpportunitySchema,
  exportOpportunitiesSchema,
  listOpportunitiesSchema,
  moveStageSchema,
  updateOpportunitySchema,
} from './opportunities.schema';

export const opportunitiesRouter: Router = Router();

opportunitiesRouter.use(authenticate);

opportunitiesRouter.get('/', requirePermission('opportunities.read'), validate({ query: listOpportunitiesSchema }), asyncHandler(controller.list));
opportunitiesRouter.get('/board', requirePermission('opportunities.read'), validate({ query: listOpportunitiesSchema }), asyncHandler(controller.board));
opportunitiesRouter.get('/export', requirePermission('opportunities.export'), heavyLimiter, validate({ query: exportOpportunitiesSchema }), asyncHandler(controller.exportOpportunities));
opportunitiesRouter.get('/:id', requirePermission('opportunities.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
opportunitiesRouter.post('/', requirePermission('opportunities.create'), validate({ body: createOpportunitySchema }), asyncHandler(controller.create));
opportunitiesRouter.patch('/:id', requirePermission('opportunities.update'), validate({ params: idParamSchema, body: updateOpportunitySchema }), asyncHandler(controller.update));
opportunitiesRouter.post('/:id/stage', requirePermission('opportunities.update'), validate({ params: idParamSchema, body: moveStageSchema }), asyncHandler(controller.moveStage));
opportunitiesRouter.delete('/:id', requirePermission('opportunities.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
