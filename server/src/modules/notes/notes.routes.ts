import { Router } from 'express';
import { asyncHandler } from '../../core/http';
import { authenticate, requirePermission } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../core/validators';
import * as controller from './notes.controller';
import { createNoteSchema, listNotesSchema, updateNoteSchema } from './notes.schema';

export const notesRouter: Router = Router();

notesRouter.use(authenticate);

notesRouter.get('/', requirePermission('notes.read'), validate({ query: listNotesSchema }), asyncHandler(controller.list));
notesRouter.post('/', requirePermission('notes.create'), validate({ body: createNoteSchema }), asyncHandler(controller.create));
notesRouter.patch('/:id', requirePermission('notes.update'), validate({ params: idParamSchema, body: updateNoteSchema }), asyncHandler(controller.update));
notesRouter.delete('/:id', requirePermission('notes.delete'), validate({ params: idParamSchema }), asyncHandler(controller.remove));
