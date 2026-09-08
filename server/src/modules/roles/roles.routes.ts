import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../core/validators';
import * as controller from './roles.controller';
import { createRoleSchema, updateRoleSchema } from './roles.controller';

export const rolesRouter: Router = Router();

rolesRouter.use(authenticate);

rolesRouter.get('/', requirePermission('roles.read', 'users.read'), asyncHandler(controller.list));
rolesRouter.get('/catalog', requirePermission('roles.read'), asyncHandler(controller.catalog));
rolesRouter.get('/:id', requirePermission('roles.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
rolesRouter.post('/', requirePermission('roles.manage'), validate({ body: createRoleSchema }), asyncHandler(controller.create));
rolesRouter.patch('/:id', requirePermission('roles.manage'), validate({ params: idParamSchema, body: updateRoleSchema }), asyncHandler(controller.update));
rolesRouter.delete('/:id', requirePermission('roles.manage'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
