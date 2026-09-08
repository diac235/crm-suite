import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './quotes.controller';
import {
  changeQuoteStatusSchema,
  createQuoteSchema,
  exportQuotesSchema,
  listQuotesSchema,
  updateQuoteSchema,
} from './quotes.schema';

export const quotesRouter: Router = Router();

quotesRouter.use(authenticate);

quotesRouter.get('/', requirePermission('quotes.read'), validate({ query: listQuotesSchema }), asyncHandler(controller.list));
quotesRouter.get('/export', requirePermission('quotes.export'), heavyLimiter, validate({ query: exportQuotesSchema }), asyncHandler(controller.exportQuotes));
quotesRouter.get('/:id', requirePermission('quotes.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
quotesRouter.get('/:id/pdf', requirePermission('quotes.read'), heavyLimiter, validate({ params: idParamSchema }), asyncHandler(controller.pdf));
quotesRouter.post('/', requirePermission('quotes.create'), validate({ body: createQuoteSchema }), asyncHandler(controller.create));
quotesRouter.patch('/:id', requirePermission('quotes.update'), validate({ params: idParamSchema, body: updateQuoteSchema }), asyncHandler(controller.update));
quotesRouter.post('/:id/status', requirePermission('quotes.update'), validate({ params: idParamSchema, body: changeQuoteStatusSchema }), asyncHandler(controller.changeStatus));
quotesRouter.post('/:id/convert-to-sale', requirePermission('sales.create'), validate({ params: idParamSchema }), asyncHandler(controller.convertToSale));
quotesRouter.delete('/:id', requirePermission('quotes.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
