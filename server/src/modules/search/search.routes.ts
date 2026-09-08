import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as controller from './search.controller';
import { globalSearchSchema } from './search.controller';

export const searchRouter: Router = Router();

searchRouter.use(authenticate);
searchRouter.get('/', validate({ query: globalSearchSchema }), asyncHandler(controller.globalSearch));
