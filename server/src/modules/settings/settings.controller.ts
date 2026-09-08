import type { Request, Response } from 'express';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db } from '../../db';
import { settings } from '../../db/schema';
import { ok } from '../../core/http';
import { BadRequestError } from '../../core/errors';
import { recordAudit } from '../../services/audit.service';
import { getSetting, getSettings, setSetting } from '../../services/settings.service';
import { DEFAULT_SETTINGS } from './settings.defaults';

const companyProfileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  legalName: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(30),
  address: z.string().trim().max(300),
  city: z.string().trim().max(120),
  state: z.string().trim().max(120),
  country: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.string().trim().email().max(190).or(z.literal('')),
  website: z.string().trim().max(190),
  logoUrl: z.string().trim().max(300),
});

const currencySchema = z.object({
  code: z.string().trim().min(3).max(8),
  symbol: z.string().trim().min(1).max(5),
  locale: z.string().trim().min(2).max(20),
  decimals: z.coerce.number().int().min(0).max(4),
});

const quoteDefaultsSchema = z.object({
  validityDays: z.coerce.number().int().min(1).max(365),
  terms: z.string().trim().max(3000),
  footerNote: z.string().trim().max(300),
});

const crmDefaultsSchema = z.object({
  defaultCountry: z.string().trim().max(120),
  staleOpportunityDays: z.coerce.number().int().min(1).max(365),
  followUpReminderHours: z.coerce.number().int().min(1).max(720),
});

/** Esquema de validación por clave de configuración. */
const VALIDATORS: Record<string, z.ZodTypeAny> = {
  'company.profile': companyProfileSchema,
  'finance.currency': currencySchema,
  'quotes.defaults': quoteDefaultsSchema,
  'crm.defaults': crmDefaultsSchema,
};

export const settingKeyParamSchema = z.object({
  key: z.enum(['company.profile', 'finance.currency', 'quotes.defaults', 'crm.defaults']),
});

export const updateSettingSchema = z.object({ value: z.unknown() });

export async function listAll(_req: Request, res: Response): Promise<void> {
  const rows = await db.select().from(settings).orderBy(asc(settings.key));
  const map = await getSettings(rows.map((r) => r.key));
  ok(
    res,
    rows.map((row) => ({
      key: row.key,
      value: map[row.key],
      description: row.description,
      isPublic: row.isPublic,
      updatedAt: row.updatedAt,
    })),
  );
}

/** Configuración que el frontend necesita antes de autenticar (moneda, empresa). */
export async function publicSettings(_req: Request, res: Response): Promise<void> {
  const keys = DEFAULT_SETTINGS.filter((s) => s.isPublic).map((s) => s.key);
  ok(res, await getSettings(keys));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const key = req.params.key!;
  ok(res, { key, value: await getSetting(key) });
}

export async function updateOne(req: Request, res: Response): Promise<void> {
  const key = req.params.key!;
  const validator = VALIDATORS[key];
  if (!validator) throw new BadRequestError('Clave de configuración no admitida');

  const parsed = validator.safeParse((req.body as { value: unknown }).value);
  if (!parsed.success) {
    throw new BadRequestError('Configuración inválida', parsed.error.issues);
  }

  const before = await getSetting(key);
  await setSetting(key, parsed.data);

  await recordAudit({
    req, action: 'UPDATE', entityType: 'SETTING', entityLabel: key,
    module: 'settings', before, after: parsed.data,
  });

  ok(res, { key, value: parsed.data });
}
