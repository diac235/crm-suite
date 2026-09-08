import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { emailSchema, optionalText, optionalUuid, passwordSchema, requiredText } from '../../core/validators';

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: requiredText(80, 'El nombre'),
  lastName: requiredText(80, 'El apellido'),
  phone: optionalText(40),
  position: optionalText(120),
  roleId: z.string().uuid('Debe seleccionar un rol'),
  teamId: optionalUuid,
  isActive: z.coerce.boolean().default(true),
  mustChangePassword: z.coerce.boolean().default(true),
});

export const updateUserSchema = z
  .object({
    email: emailSchema.optional(),
    firstName: requiredText(80, 'El nombre').optional(),
    lastName: requiredText(80, 'El apellido').optional(),
    phone: optionalText(40),
    position: optionalText(120),
    roleId: z.string().uuid().optional(),
    teamId: optionalUuid,
    isActive: z.coerce.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
  mustChangePassword: z.coerce.boolean().default(true),
});

export const listUsersSchema = paginationSchema.extend({
  roleId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersSchema>;
