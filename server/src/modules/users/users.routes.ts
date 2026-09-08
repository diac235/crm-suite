import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../core/validators';
import * as controller from './users.controller';
import {
  createUserSchema,
  listUsersSchema,
  resetPasswordSchema,
  updateUserSchema,
} from './users.schema';

export const usersRouter: Router = Router();

usersRouter.use(authenticate);

usersRouter.get('/', requirePermission('users.read'), validate({ query: listUsersSchema }), asyncHandler(controller.list));
// El selector de responsables lo necesitan todos los módulos comerciales.
usersRouter.get('/options', asyncHandler(controller.options));
usersRouter.get('/:id', requirePermission('users.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
usersRouter.post('/', requirePermission('users.create'), validate({ body: createUserSchema }), asyncHandler(controller.create));
usersRouter.patch('/:id', requirePermission('users.update'), validate({ params: idParamSchema, body: updateUserSchema }), asyncHandler(controller.update));
usersRouter.post('/:id/reset-password', requirePermission('users.update'), validate({ params: idParamSchema, body: resetPasswordSchema }), asyncHandler(controller.resetPassword));
usersRouter.post('/:id/unlock', requirePermission('users.update'), validate({ params: idParamSchema }), asyncHandler(controller.unlock));
usersRouter.delete('/:id', requirePermission('users.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
