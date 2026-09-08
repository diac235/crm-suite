import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { optionalDate, optionalText, optionalUuid, requiredText } from '../../core/validators';

export const taskStatuses = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'] as const;
export const taskPriorities = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const;

const base = {
  title: requiredText(200, 'El título'),
  description: optionalText(2000),
  priority: z.enum(taskPriorities).default('MEDIA'),
  status: z.enum(taskStatuses).default('PENDIENTE'),
  dueAt: optionalDate,
  assigneeId: optionalUuid,
  clientId: optionalUuid,
  prospectId: optionalUuid,
  opportunityId: optionalUuid,
};

export const createTaskSchema = z.object(base);

export const updateTaskSchema = z
  .object(base)
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const listTasksSchema = paginationSchema.extend({
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  assigneeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  overdue: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportTasksSchema = listTasksSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export const createCommentSchema = z.object({ body: requiredText(2000, 'El comentario') });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksSchema>;
