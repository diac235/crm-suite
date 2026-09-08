import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../core/validators';
import * as controller from './teams.controller';
import { createTeamSchema, updateTeamSchema } from './teams.controller';

export const teamsRouter: Router = Router();

teamsRouter.use(authenticate);

teamsRouter.get('/', requirePermission('teams.read', 'users.read'), asyncHandler(controller.list));
teamsRouter.post('/', requirePermission('teams.create'), validate({ body: createTeamSchema }), asyncHandler(controller.create));
teamsRouter.patch('/:id', requirePermission('teams.update'), validate({ params: idParamSchema, body: updateTeamSchema }), asyncHandler(controller.update));
teamsRouter.delete('/:id', requirePermission('teams.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
