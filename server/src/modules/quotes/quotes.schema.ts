import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import {
  optionalText,
  optionalUuid,
  percentSchema,
  requiredText,
  uuidSchema,
} from '../../core/validators';

export const quoteStatuses = [
  'BORRADOR',
  'ENVIADA',
  'EN_NEGOCIACION',
  'ACEPTADA',
  'RECHAZADA',
  'VENCIDA',
] as const;

export const quoteItemSchema = z.object({
  productId: optionalUuid,
  description: requiredText(300, 'La descripción del ítem'),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero').max(999_999),
  unitPrice: z.coerce.number().min(0).max(9_999_999.99),
  discountPct: percentSchema.default(0),
  taxRateId: optionalUuid,
  taxPct: percentSchema.default(0),
});

const base = {
  clientId: uuidSchema,
  contactId: optionalUuid,
  opportunityId: optionalUuid,
  ownerId: optionalUuid,
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date(),
  currency: z.string().trim().min(3).max(8).default('USD'),
  notes: optionalText(2000),
  terms: optionalText(3000),
};

export const createQuoteSchema = z.object({
  ...base,
  items: z.array(quoteItemSchema).min(1, 'Debe incluir al menos un ítem'),
});

export const updateQuoteSchema = z
  .object({
    ...base,
    clientId: uuidSchema.optional(),
    validUntil: z.coerce.date().optional(),
    items: z.array(quoteItemSchema).min(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const changeQuoteStatusSchema = z.object({
  status: z.enum(quoteStatuses),
  rejectionReason: optionalText(500),
});

export const listQuotesSchema = paginationSchema.extend({
  status: z.enum(quoteStatuses).optional(),
  clientId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportQuotesSchema = listQuotesSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type ListQuotesQuery = z.infer<typeof listQuotesSchema>;
export type QuoteItemInput = z.infer<typeof quoteItemSchema>;
