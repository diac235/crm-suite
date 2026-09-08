import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './contacts.controller';
import {
  createContactSchema,
  exportContactsSchema,
  listContactsSchema,
  updateContactSchema,
} from './contacts.schema';

export const contactsRouter: Router = Router();

contactsRouter.use(authenticate);

contactsRouter.get('/', requirePermission('contacts.read'), validate({ query: listContactsSchema }), asyncHandler(controller.list));
contactsRouter.get(
  '/options',
  requirePermission('contacts.read'),
  validate({ query: z.object({ clientId: z.string().uuid().optional() }) }),
  asyncHandler(controller.options),
);
contactsRouter.get('/export', requirePermission('contacts.export'), heavyLimiter, validate({ query: exportContactsSchema }), asyncHandler(controller.exportContacts));
contactsRouter.get('/:id', requirePermission('contacts.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
contactsRouter.post('/', requirePermission('contacts.create'), validate({ body: createContactSchema }), asyncHandler(controller.create));
contactsRouter.patch('/:id', requirePermission('contacts.update'), validate({ params: idParamSchema, body: updateContactSchema }), asyncHandler(controller.update));
contactsRouter.delete('/:id', requirePermission('contacts.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
