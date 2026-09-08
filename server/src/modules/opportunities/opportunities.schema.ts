import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import {
  moneySchema,
  optionalDate,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from '../../core/validators';

export const opportunityStatuses = ['ABIERTA', 'GANADA', 'PERDIDA', 'CANCELADA'] as const;

const base = {
  name: requiredText(200, 'El nombre de la oportunidad'),
  clientId: optionalUuid,
  prospectId: optionalUuid,
  contactId: optionalUuid,
  ownerId: optionalUuid,
  stageId: uuidSchema,
  sourceId: optionalUuid,
  amount: moneySchema,
  currency: z.string().trim().min(3).max(8).default('USD'),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseAt: optionalDate,
  competitor: optionalText(200),
  description: optionalText(2000),
};

export const createOpportunitySchema = z
  .object(base)
  .refine((d) => Boolean(d.clientId ?? d.prospectId), {
    message: 'Debe asociar la oportunidad a un cliente o a un prospecto',
    path: ['clientId'],
  });

export const updateOpportunitySchema = z
  .object({ ...base, stageId: uuidSchema.optional(), lostReason: optionalText(500) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const moveStageSchema = z.object({
  stageId: uuidSchema,
  note: optionalText(500),
  lostReason: optionalText(500),
});

export const listOpportunitiesSchema = paginationSchema.extend({
  status: z.enum(opportunityStatuses).optional(),
  stageId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportOpportunitiesSchema = listOpportunitiesSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesSchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
