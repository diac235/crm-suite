import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { moneySchema, optionalMoney, optionalText, optionalUuid, requiredText } from '../../core/validators';

const base = {
  sku: requiredText(40, 'El código (SKU)'),
  name: requiredText(200, 'El nombre'),
  description: optionalText(1000),
  category: optionalText(120),
  unit: z.string().trim().min(1).max(30).default('UNIDAD'),
  price: moneySchema,
  cost: optionalMoney,
  taxRateId: optionalUuid,
  isActive: z.coerce.boolean().default(true),
};

export const createProductSchema = z.object(base);
export const updateProductSchema = z
  .object(base)
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const listProductsSchema = paginationSchema.extend({
  category: z.string().trim().max(120).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const exportProductsSchema = listProductsSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
