import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import * as controller from './reports.controller';
import { reportExportSchema, reportQuerySchema } from './reports.controller';

export const reportsRouter: Router = Router();

reportsRouter.use(authenticate);

reportsRouter.get('/sales', requirePermission('reports.read'), validate({ query: reportQuerySchema }), asyncHandler(controller.salesReport));
reportsRouter.get('/opportunities', requirePermission('reports.read'), validate({ query: reportQuerySchema }), asyncHandler(controller.opportunitiesReport));
reportsRouter.get('/clients', requirePermission('reports.read'), validate({ query: reportQuerySchema }), asyncHandler(controller.clientsReport));
reportsRouter.get('/activities', requirePermission('reports.read'), validate({ query: reportQuerySchema }), asyncHandler(controller.activitiesReport));
reportsRouter.get('/export', requirePermission('reports.export'), heavyLimiter, validate({ query: reportExportSchema }), asyncHandler(controller.exportReport));
