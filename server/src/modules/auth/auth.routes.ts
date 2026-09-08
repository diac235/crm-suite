import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { authLimiter } from '../../middlewares/rateLimit';
import * as controller from './auth.controller';
import { changePasswordSchema, loginSchema, updateProfileSchema } from './auth.schema';

export const authRouter: Router = Router();

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
authRouter.post('/refresh', asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', authenticate, asyncHandler(controller.me));
authRouter.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  asyncHandler(controller.updateProfile),
);
authRouter.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(controller.changePassword),
);
