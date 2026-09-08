import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { heavyLimiter } from '../../middlewares/rateLimit';
import { idParamSchema } from '../../core/validators';
import * as controller from './tasks.controller';
import {
  createCommentSchema,
  createTaskSchema,
  exportTasksSchema,
  listTasksSchema,
  updateTaskSchema,
} from './tasks.schema';

export const tasksRouter: Router = Router();

tasksRouter.use(authenticate);

tasksRouter.get('/', requirePermission('tasks.read'), validate({ query: listTasksSchema }), asyncHandler(controller.list));
tasksRouter.get('/export', requirePermission('tasks.export'), heavyLimiter, validate({ query: exportTasksSchema }), asyncHandler(controller.exportTasks));
tasksRouter.get('/:id', requirePermission('tasks.read'), validate({ params: idParamSchema }), asyncHandler(controller.detail));
tasksRouter.post('/', requirePermission('tasks.create'), validate({ body: createTaskSchema }), asyncHandler(controller.create));
tasksRouter.patch('/:id', requirePermission('tasks.update'), validate({ params: idParamSchema, body: updateTaskSchema }), asyncHandler(controller.update));
tasksRouter.post('/:id/comments', requirePermission('tasks.update'), validate({ params: idParamSchema, body: createCommentSchema }), asyncHandler(controller.addComment));
tasksRouter.delete('/:id', requirePermission('tasks.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
