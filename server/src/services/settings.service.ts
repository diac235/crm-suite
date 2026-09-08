import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { settings } from '../db/schema';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults';
import { logger } from '../config/logger';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

function defaultFor(key: string): unknown {
  return DEFAULT_SETTINGS.find((s) => s.key === key)?.value ?? null;
}

function parse(raw: string, key: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    logger.warn({ key }, 'Configuración con JSON inválido, se usa el valor por defecto');
    return defaultFor(key);
  }
}

/** Lee una clave de configuración con caché en memoria de corta duración. */
export async function getSetting<T = unknown>(key: string): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const value = row ? parse(row.value, key) : defaultFor(key);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value as T;
}

export async function getSettings(keys: string[]): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const map: Record<string, unknown> = {};
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    map[key] = row ? parse(row.value, key) : defaultFor(key);
  }
  return map;
}

export async function setSetting(key: string, value: unknown, description?: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value), description: description ?? null })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value), updatedAt: new Date() },
    });
  cache.delete(key);
}

export function invalidateSettingsCache(): void {
  cache.clear();
}

export interface CompanyProfile {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
  decimals: number;
}

export interface QuoteDefaults {
  validityDays: number;
  terms: string;
  footerNote: string;
}
