import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Sectores / industrias (configurable desde el módulo de configuración). */
export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Fuentes de prospectos (Referido, Web, Feria, Llamada en frío, ...). */
export const prospectSources = pgTable('prospect_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tipos de actividad configurables. */
export const activityTypes = pgTable('activity_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: varchar('name', { length: 80 }).notNull(),
  icon: varchar('icon', { length: 40 }),
  color: varchar('color', { length: 16 }).notNull().default('#6366f1'),
  isActive: boolean('is_active').notNull().default(true),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Etapas del pipeline comercial, ordenables y configurables. */
export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull().unique(),
    order: integer('order').notNull().default(0),
    probability: integer('probability').notNull().default(0),
    color: varchar('color', { length: 16 }).notNull().default('#6366f1'),
    isWon: boolean('is_won').notNull().default(false),
    isLost: boolean('is_lost').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pipeline_stages_order_idx').on(t.order)],
);

/** Tarifas de impuesto aplicables a productos y líneas de cotización. */
export const taxRates = pgTable('tax_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  rate: numeric('rate', { precision: 6, scale: 3 }).notNull().default('0'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Configuración del sistema en formato clave/valor JSON. */
export const settings = pgTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  isPublic: boolean('is_public').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Secuencias de numeración (clientes, cotizaciones, ventas, ...). */
export const counters = pgTable('counters', {
  key: varchar('key', { length: 60 }).primaryKey(),
  value: integer('value').notNull().default(0),
});
