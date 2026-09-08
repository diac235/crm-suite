import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import {
  optionalDate,
  optionalEmail,
  optionalMoney,
  optionalText,
  optionalUuid,
  requiredText,
} from '../../core/validators';

export const prospectStatuses = [
  'NUEVO',
  'CONTACTADO',
  'CALIFICADO',
  'EN_NEGOCIACION',
  'CONVERTIDO',
  'PERDIDO',
] as const;

export const temperatures = ['FRIO', 'TIBIO', 'CALIENTE'] as const;

const base = {
  firstName: requiredText(80, 'El nombre'),
  lastName: optionalText(80),
  companyName: optionalText(200),
  taxId: optionalText(30),
  position: optionalText(120),
  phone: optionalText(40),
  mobile: optionalText(40),
  email: optionalEmail,
  sourceId: optionalUuid,
  sectorId: optionalUuid,
  ownerId: optionalUuid,
  status: z.enum(prospectStatuses).default('NUEVO'),
  temperature: z.enum(temperatures).default('TIBIO'),
  estimatedValue: optionalMoney,
  lastContactAt: optionalDate,
  nextFollowUpAt: optionalDate,
  lostReason: optionalText(500),
  notes: optionalText(2000),
};

export const createProspectSchema = z.object(base);

export const updateProspectSchema = z
  .object(base)
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const listProspectsSchema = paginationSchema.extend({
  status: z.enum(prospectStatuses).optional(),
  temperature: z.enum(temperatures).optional(),
  sourceId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  overdueFollowUp: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportProspectsSchema = listProspectsSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export const convertProspectSchema = z.object({
  kind: z.enum(['EMPRESA', 'PERSONA_NATURAL', 'GOBIERNO', 'ONG']).default('EMPRESA'),
  legalName: requiredText(200, 'La razón social'),
  tradeName: optionalText(200),
  taxId: optionalText(30),
  address: optionalText(400),
  city: optionalText(120),
  state: optionalText(120),
  country: z.string().trim().min(1).max(120).default('Ecuador'),
  createPrimaryContact: z.coerce.boolean().default(true),
});

export type CreateProspectInput = z.infer<typeof createProspectSchema>;
export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;
export type ListProspectsQuery = z.infer<typeof listProspectsSchema>;
export type ConvertProspectInput = z.infer<typeof convertProspectSchema>;
