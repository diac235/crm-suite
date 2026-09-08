import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as controller from './settings.controller';
import { settingKeyParamSchema, updateSettingSchema } from './settings.controller';

export const settingsRouter: Router = Router();

settingsRouter.use(authenticate);

// Configuración de uso general en la interfaz (moneda, datos de empresa).
// Requiere sesión: no se expone información corporativa antes del acceso.
settingsRouter.get('/public', asyncHandler(controller.publicSettings));

settingsRouter.get('/', requirePermission('settings.read'), asyncHandler(controller.listAll));
settingsRouter.get('/:key', requirePermission('settings.read'), validate({ params: settingKeyParamSchema }), asyncHandler(controller.getOne));
settingsRouter.put(
  '/:key',
  requirePermission('settings.manage'),
  validate({ params: settingKeyParamSchema, body: updateSettingSchema }),
  asyncHandler(controller.updateOne),
);
