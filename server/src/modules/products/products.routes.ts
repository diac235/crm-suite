import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './products.controller';
import {
  createProductSchema,
  exportProductsSchema,
  listProductsSchema,
  updateProductSchema,
} from './products.schema';

export const productsRouter: Router = Router();

productsRouter.use(authenticate);

productsRouter.get('/', requirePermission('products.read'), validate({ query: listProductsSchema }), asyncHandler(controller.list));
productsRouter.get('/export', requirePermission('products.export'), heavyLimiter, validate({ query: exportProductsSchema }), asyncHandler(controller.exportProducts));
productsRouter.get('/:id', requirePermission('products.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
productsRouter.post('/', requirePermission('products.create'), validate({ body: createProductSchema }), asyncHandler(controller.create));
productsRouter.patch('/:id', requirePermission('products.update'), validate({ params: idParamSchema, body: updateProductSchema }), asyncHandler(controller.update));
productsRouter.delete('/:id', requirePermission('products.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
