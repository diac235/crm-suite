import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { optionalUuid, requiredText } from '../../core/validators';

export const createNoteSchema = z
  .object({
    body: requiredText(4000, 'El contenido de la nota'),
    clientId: optionalUuid,
    prospectId: optionalUuid,
    opportunityId: optionalUuid,
    isPinned: z.coerce.boolean().default(false),
  })
  .refine((d) => Boolean(d.clientId ?? d.prospectId ?? d.opportunityId), {
    message: 'Debe indicar a qué registro pertenece la nota',
    path: ['clientId'],
  });

export const updateNoteSchema = z.object({
  body: requiredText(4000, 'El contenido de la nota').optional(),
  isPinned: z.coerce.boolean().optional(),
});

export const listNotesSchema = paginationSchema.extend({
  clientId: z.string().uuid().optional(),
  prospectId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
});

export type ListNotesQuery = z.infer<typeof listNotesSchema>;
