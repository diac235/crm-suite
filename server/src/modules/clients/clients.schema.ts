import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import {
  optionalEmail,
  optionalMoney,
  optionalText,
  optionalUuid,
  requiredText,
} from '../../core/validators';

export const clientKinds = ['EMPRESA', 'PERSONA_NATURAL', 'GOBIERNO', 'ONG'] as const;
export const clientStatuses = ['ACTIVO', 'INACTIVO', 'ARCHIVADO', 'POTENCIAL'] as const;

const baseClient = {
  kind: z.enum(clientKinds).default('EMPRESA'),
  taxId: optionalText(30),
  legalName: requiredText(200, 'La razón social'),
  tradeName: optionalText(200),
  address: optionalText(400),
  city: optionalText(120),
  state: optionalText(120),
  country: z.string().trim().min(1).max(120).default('Ecuador'),
  phone: optionalText(40),
  mobile: optionalText(40),
  email: optionalEmail,
  website: optionalText(190),
  sectorId: optionalUuid,
  economicActivity: optionalText(200),
  status: z.enum(clientStatuses).default('ACTIVO'),
  ownerId: optionalUuid,
  creditLimit: optionalMoney,
  notes: optionalText(2000),
};

export const createClientSchema = z.object(baseClient);

export const updateClientSchema = z.object(baseClient).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Debe enviar al menos un campo para actualizar' },
);

export const listClientsSchema = paginationSchema.extend({
  status: z.enum(clientStatuses).optional(),
  kind: z.enum(clientKinds).optional(),
  sectorId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  city: z.string().trim().max(120).optional(),
  includeArchived: z.coerce.boolean().default(false),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportClientsSchema = listClientsSchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(5000),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsSchema>;
