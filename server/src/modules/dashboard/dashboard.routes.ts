import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { periodSchema } from '../../core/dates';
import * as controller from './dashboard.controller';

export const dashboardRouter: Router = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/summary', requirePermission('dashboard.read'), validate({ query: periodSchema }), asyncHandler(controller.summary));
dashboardRouter.get('/charts', requirePermission('dashboard.read'), validate({ query: periodSchema }), asyncHandler(controller.charts));
