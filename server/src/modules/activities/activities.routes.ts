import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './activities.controller';
import {
  calendarSchema,
  createActivitySchema,
  exportActivitiesSchema,
  listActivitiesSchema,
  updateActivitySchema,
} from './activities.schema';

export const activitiesRouter: Router = Router();

activitiesRouter.use(authenticate);

activitiesRouter.get('/', requirePermission('activities.read'), validate({ query: listActivitiesSchema }), asyncHandler(controller.list));
activitiesRouter.get('/calendar', requirePermission('activities.read'), validate({ query: calendarSchema }), asyncHandler(controller.calendar));
activitiesRouter.get('/export', requirePermission('activities.export'), heavyLimiter, validate({ query: exportActivitiesSchema }), asyncHandler(controller.exportActivities));
activitiesRouter.get('/:id', requirePermission('activities.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
activitiesRouter.post('/', requirePermission('activities.create'), validate({ body: createActivitySchema }), asyncHandler(controller.create));
activitiesRouter.patch('/:id', requirePermission('activities.update'), validate({ params: idParamSchema, body: updateActivitySchema }), asyncHandler(controller.update));
activitiesRouter.delete('/:id', requirePermission('activities.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
