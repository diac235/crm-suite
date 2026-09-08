import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { optionalEmail, optionalText, requiredText, uuidSchema } from '../../core/validators';

const base = {
  clientId: uuidSchema,
  firstName: requiredText(80, 'El nombre'),
  lastName: requiredText(80, 'El apellido'),
  position: optionalText(120),
  department: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  mobile: optionalText(40),
  whatsapp: optionalText(40),
  birthDate: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD)')])
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  isPrimary: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  notes: optionalText(2000),
};

export const createContactSchema = z.object(base);
export const updateContactSchema = z
  .object({ ...base, clientId: uuidSchema.optional() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const listContactsSchema = paginationSchema.extend({
  clientId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  isPrimary: z.coerce.boolean().optional(),
});

export const exportContactsSchema = listContactsSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsSchema>;
