import type { Express } from 'express';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import { seed } from '../src/db/seed';
import { env } from '../src/config/env';

export const app: Express = createApp();

/** Limpia y reconstruye el esquema de pruebas antes de la suite. */
export async function resetDatabase(): Promise<void> {
  // También se elimina el esquema de control de drizzle para reaplicar todas
  // las migraciones desde cero en cada suite.
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE;`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE;`);
  await db.execute(sql`CREATE SCHEMA public;`);
  await runMigrations();
  await seed();
}

export interface Session {
  token: string;
  userId: string;
}

export async function loginAs(email: string, password: string): Promise<Session> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login fallido (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return { token: response.body.data.accessToken, userId: response.body.data.user.id };
}

export async function loginAsAdmin(): Promise<Session> {
  return loginAs(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
}

export function auth(session: Session) {
  return { Authorization: `Bearer ${session.token}` };
}

export async function firstCatalogIds() {
  const bootstrap = await db.execute(sql`
    SELECT
      (SELECT id FROM sectors ORDER BY "order" LIMIT 1) AS "sectorId",
      (SELECT id FROM prospect_sources ORDER BY "order" LIMIT 1) AS "sourceId",
      (SELECT id FROM activity_types WHERE code = 'LLAMADA' LIMIT 1) AS "callTypeId",
      (SELECT id FROM activity_types WHERE code = 'REUNION' LIMIT 1) AS "meetingTypeId",
      (SELECT id FROM pipeline_stages ORDER BY "order" LIMIT 1) AS "firstStageId",
      (SELECT id FROM pipeline_stages WHERE is_won = TRUE LIMIT 1) AS "wonStageId",
      (SELECT id FROM pipeline_stages WHERE is_lost = TRUE LIMIT 1) AS "lostStageId",
      (SELECT id FROM tax_rates WHERE is_default = TRUE LIMIT 1) AS "taxRateId",
      (SELECT id FROM roles WHERE slug = 'usuario' LIMIT 1) AS "userRoleId",
      (SELECT id FROM roles WHERE slug = 'admin' LIMIT 1) AS "adminRoleId"
  `);
  return (bootstrap as unknown as { rows: Array<Record<string, string>> }).rows[0]!;
}
