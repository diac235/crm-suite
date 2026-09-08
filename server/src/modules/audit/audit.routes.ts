import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import * as controller from './audit.controller';
import { exportAuditSchema, listAuditSchema } from './audit.controller';

export const auditRouter: Router = Router();

auditRouter.use(authenticate);

auditRouter.get('/', requirePermission('audit.read'), validate({ query: listAuditSchema }), asyncHandler(controller.list));
auditRouter.get('/stats', requirePermission('audit.read'), asyncHandler(controller.stats));
auditRouter.get('/export', requirePermission('audit.export'), heavyLimiter, validate({ query: exportAuditSchema }), asyncHandler(controller.exportAudit));
