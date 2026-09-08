import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './sales.controller';
import { createSaleSchema, exportSalesSchema, listSalesSchema, updateSaleSchema } from './sales.schema';

export const salesRouter: Router = Router();

salesRouter.use(authenticate);

salesRouter.get('/', requirePermission('sales.read'), validate({ query: listSalesSchema }), asyncHandler(controller.list));
salesRouter.get('/export', requirePermission('sales.export'), heavyLimiter, validate({ query: exportSalesSchema }), asyncHandler(controller.exportSales));
salesRouter.get('/:id', requirePermission('sales.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
salesRouter.post('/', requirePermission('sales.create'), validate({ body: createSaleSchema }), asyncHandler(controller.create));
salesRouter.patch('/:id', requirePermission('sales.update'), validate({ params: idParamSchema, body: updateSaleSchema }), asyncHandler(controller.update));
salesRouter.delete('/:id', requirePermission('sales.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
