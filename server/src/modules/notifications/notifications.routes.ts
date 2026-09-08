import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as controller from './notifications.controller';
import { listNotificationsSchema, markReadSchema } from './notifications.controller';

export const notificationsRouter: Router = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get('/', validate({ query: listNotificationsSchema }), asyncHandler(controller.list));
notificationsRouter.get('/unread-count', asyncHandler(controller.unreadCount));
notificationsRouter.post('/read', validate({ body: markReadSchema }), asyncHandler(controller.markRead));
notificationsRouter.post('/read-all', asyncHandler(controller.markAll));
notificationsRouter.post('/refresh', requirePermission('notifications.update'), asyncHandler(controller.refresh));
