import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { optionalText, optionalUuid, requiredText, uuidSchema } from '../../core/validators';

export const saleStatuses = ['PENDIENTE', 'FACTURADA', 'COBRADA', 'ANULADA'] as const;

export const saleItemSchema = z.object({
  productId: optionalUuid,
  description: requiredText(300, 'La descripción'),
  quantity: z.coerce.number().positive().max(999_999),
  unitPrice: z.coerce.number().min(0).max(9_999_999.99),
});

const base = {
  clientId: uuidSchema,
  opportunityId: optionalUuid,
  quoteId: optionalUuid,
  ownerId: optionalUuid,
  saleDate: z.coerce.date().optional(),
  currency: z.string().trim().min(3).max(8).default('USD'),
  taxTotal: z.coerce.number().min(0).default(0),
  notes: optionalText(2000),
};

export const createSaleSchema = z.object({
  ...base,
  items: z.array(saleItemSchema).min(1, 'Debe incluir al menos un ítem'),
});

export const updateSaleSchema = z
  .object({
    status: z.enum(saleStatuses).optional(),
    saleDate: z.coerce.date().optional(),
    notes: optionalText(2000),
    ownerId: optionalUuid,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const listSalesSchema = paginationSchema.extend({
  status: z.enum(saleStatuses).optional(),
  clientId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportSalesSchema = listSalesSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesSchema>;
