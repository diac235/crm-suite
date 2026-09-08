import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { optionalText, optionalUuid, requiredText, uuidSchema } from '../../core/validators';

export const activityStatuses = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'] as const;

const base = {
  typeId: uuidSchema,
  subject: requiredText(200, 'El asunto'),
  description: optionalText(2000),
  clientId: optionalUuid,
  contactId: optionalUuid,
  prospectId: optionalUuid,
  opportunityId: optionalUuid,
  quoteId: optionalUuid,
  ownerId: optionalUuid,
  status: z.enum(activityStatuses).default('PENDIENTE'),
  scheduledAt: z.coerce.date(),
  durationMin: z.coerce.number().int().min(0).max(1440).default(30),
  location: optionalText(200),
  outcome: optionalText(2000),
};

export const createActivitySchema = z.object(base);

export const updateActivitySchema = z
  .object({ ...base, typeId: uuidSchema.optional(), scheduledAt: z.coerce.date().optional() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const listActivitiesSchema = paginationSchema.extend({
  status: z.enum(activityStatuses).optional(),
  typeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  prospectId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const calendarSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  ownerId: z.string().uuid().optional(),
  typeId: z.string().uuid().optional(),
  includeTasks: z.coerce.boolean().default(true),
});

export const exportActivitiesSchema = listActivitiesSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type ListActivitiesQuery = z.infer<typeof listActivitiesSchema>;
export type CalendarQuery = z.infer<typeof calendarSchema>;
