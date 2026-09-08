import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { optionalText, optionalUuid } from '../../core/validators';

export const documentCategories = [
  'CONTRATO',
  'FACTURA',
  'COTIZACION',
  'ORDEN_COMPRA',
  'IDENTIFICACION',
  'IMAGEN',
  'OTRO',
] as const;

export const uploadDocumentSchema = z
  .object({
    name: optionalText(200),
    category: z.enum(documentCategories).default('OTRO'),
    clientId: optionalUuid,
    prospectId: optionalUuid,
    opportunityId: optionalUuid,
    quoteId: optionalUuid,
  })
  .refine((d) => Boolean(d.clientId ?? d.prospectId ?? d.opportunityId ?? d.quoteId), {
    message: 'Debe indicar a qué registro se asocia el documento',
    path: ['clientId'],
  });

export const listDocumentsSchema = paginationSchema.extend({
  category: z.enum(documentCategories).optional(),
  clientId: z.string().uuid().optional(),
  prospectId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;
