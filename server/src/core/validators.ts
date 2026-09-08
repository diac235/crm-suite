import { z } from 'zod';

export const uuidSchema = z.string().uuid('Identificador inválido');

export const idParamSchema = z.object({ id: uuidSchema });

/**
 * Política de contraseñas: 10+ caracteres con mayúscula, minúscula,
 * dígito y símbolo. Se aplica en creación y cambio de contraseña.
 */
export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña es demasiado larga')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un carácter especial');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Correo electrónico inválido')
  .max(190);

/** Texto obligatorio saneado (recorta espacios y limita longitud). */
export const requiredText = (max: number, label = 'Este campo') =>
  z.string().trim().min(1, `${label} es obligatorio`).max(max);

/** Texto opcional: cadenas vacías se normalizan a null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === undefined ? null : v));

export const optionalEmail = z
  .union([z.literal(''), z.string().trim().toLowerCase().email('Correo electrónico inválido').max(190)])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined ? null : v));

export const optionalUuid = z
  .union([z.literal(''), uuidSchema])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined ? null : v));

export const optionalDate = z
  .union([z.literal(''), z.coerce.date()])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined ? null : (v as Date)));

/** Importe monetario normalizado a cadena con 2 decimales. */
export const moneySchema = z.coerce
  .number()
  .min(0, 'El importe no puede ser negativo')
  .max(9_999_999_999.99)
  .transform((v) => v.toFixed(2));

export const optionalMoney = z
  .union([z.literal(''), z.coerce.number().min(0).max(9_999_999_999.99)])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined || v === null ? null : Number(v).toFixed(2)));

export const percentSchema = z.coerce.number().min(0).max(100);
