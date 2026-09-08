import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../core/validators';
import * as controller from './catalogs.controller';
import {
  activityTypeSchema,
  catalogItemParamSchema,
  catalogParamSchema,
  pipelineStageSchema,
  simpleCatalogSchema,
  taxRateSchema,
} from './catalogs.controller';

export const catalogsRouter: Router = Router();

catalogsRouter.use(authenticate);

// Datos maestros usados por todos los formularios del sistema.
catalogsRouter.get('/bootstrap', asyncHandler(controller.bootstrap));

catalogsRouter.get('/activity-types', asyncHandler(controller.listActivityTypes));
catalogsRouter.post('/activity-types', requirePermission('settings.manage'), validate({ body: activityTypeSchema }), asyncHandler(controller.createActivityType));
catalogsRouter.patch('/activity-types/:id', requirePermission('settings.manage'), validate({ params: idParamSchema, body: activityTypeSchema.partial() }), asyncHandler(controller.updateActivityType));

catalogsRouter.get('/pipeline-stages', asyncHandler(controller.listStages));
catalogsRouter.post('/pipeline-stages', requirePermission('settings.manage'), validate({ body: pipelineStageSchema }), asyncHandler(controller.createStage));
catalogsRouter.patch('/pipeline-stages/:id', requirePermission('settings.manage'), validate({ params: idParamSchema, body: pipelineStageSchema.innerType().partial() }), asyncHandler(controller.updateStage));
catalogsRouter.delete('/pipeline-stages/:id', requirePermission('settings.manage'), validate({ params: idParamSchema }), asyncHandler(controller.removeStage));

catalogsRouter.get('/tax-rates', asyncHandler(controller.listTaxRates));
catalogsRouter.post('/tax-rates', requirePermission('settings.manage'), validate({ body: taxRateSchema }), asyncHandler(controller.createTaxRate));
catalogsRouter.patch('/tax-rates/:id', requirePermission('settings.manage'), validate({ params: idParamSchema, body: taxRateSchema.partial() }), asyncHandler(controller.updateTaxRate));

// Catálogos simples: sectors | prospect-sources
catalogsRouter.get('/:catalog', validate({ params: catalogParamSchema }), asyncHandler(controller.listSimple));
catalogsRouter.post('/:catalog', requirePermission('settings.manage'), validate({ params: catalogParamSchema, body: simpleCatalogSchema }), asyncHandler(controller.createSimple));
catalogsRouter.patch('/:catalog/:id', requirePermission('settings.manage'), validate({ params: catalogItemParamSchema, body: simpleCatalogSchema.partial() }), asyncHandler(controller.updateSimple));
catalogsRouter.delete('/:catalog/:id', requirePermission('settings.manage'), validate({ params: catalogItemParamSchema }), asyncHandler(controller.removeSimple));

