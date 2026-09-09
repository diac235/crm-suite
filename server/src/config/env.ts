import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((valor) =>
    typeof valor === 'boolean'
      ? valor
      : ['1', 'true', 'yes', 'si', 'sí'].includes(valor.trim().toLowerCase()),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default('https://crm-suite-frontend.vercel.app'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,https://crm-suite-frontend.vercel.app'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  STORAGE_DIR: z.string().default('./storage/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(200).default(15),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@crm.local'),
  SEED_ADMIN_PASSWORD: z.string().min(10).default('Admin*2026Seguro'),
  SEED_ADMIN_FIRST_NAME: z.string().default('Super'),
  SEED_ADMIN_LAST_NAME: z.string().default('Administrador'),
  SEED_DEMO_DATA: booleanish.default(false),
  RUN_MIGRATIONS_ON_START: booleanish.default(false),
  RUN_SEED_ON_START: booleanish.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuración de entorno inválida:\n${detail}`);
}

const raw = parsed.data;
   // Asegurar que el directorio de almacenamiento existe
   try {
     const fs = require('fs');
     fs.mkdirSync(raw.STORAGE_DIR, { recursive: true });
   } catch (e) {
     // Ignorar errores si el directorio ya existe
   }
export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  storageDir: path.isAbsolute(raw.STORAGE_DIR)
    ? raw.STORAGE_DIR
    : path.resolve(process.cwd(), raw.STORAGE_DIR),
  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
};

export type Env = typeof env;
