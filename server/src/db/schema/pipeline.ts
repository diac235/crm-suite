import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pipelineStages, prospectSources, taxRates } from './catalogs';
import { clients, contacts, prospects } from './crm-core';
import { opportunityStatusEnum } from './enums';
import { users } from './security';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: varchar('sku', { length: 40 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 120 }),
    unit: varchar('unit', { length: 30 }).notNull().default('UNIDAD'),
    price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),
    cost: numeric('cost', { precision: 14, scale: 2 }),
    taxRateId: uuid('tax_rate_id').references(() => taxRates.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('products_name_idx').on(t.name),
    index('products_category_idx').on(t.category),
    index('products_active_idx').on(t.isActive),
  ],
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'restrict' }),
    sourceId: uuid('source_id').references(() => prospectSources.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    probability: integer('probability').notNull().default(0),
    status: opportunityStatusEnum('status').notNull().default('ABIERTA'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    expectedCloseAt: timestamp('expected_close_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    competitor: varchar('competitor', { length: 200 }),
    lostReason: text('lost_reason'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('opportunities_client_idx').on(t.clientId),
    index('opportunities_owner_idx').on(t.ownerId),
    index('opportunities_stage_idx').on(t.stageId),
    index('opportunities_status_idx').on(t.status),
    index('opportunities_expected_close_idx').on(t.expectedCloseAt),
    index('opportunities_created_idx').on(t.createdAt),
    index('opportunities_name_idx').on(t.name),
  ],
);

export const opportunityProducts = pgTable(
  'opportunity_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [
    uniqueIndex('opportunity_products_unique').on(t.opportunityId, t.productId),
    index('opportunity_products_product_idx').on(t.productId),
  ],
);

/** Historial inmutable de movimientos entre etapas del pipeline. */
export const opportunityStageHistory = pgTable(
  'opportunity_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id').references(() => pipelineStages.id, {
      onDelete: 'set null',
    }),
    toStageId: uuid('to_stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'restrict' }),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('opportunity_stage_history_opp_idx').on(t.opportunityId),
    index('opportunity_stage_history_created_idx').on(t.createdAt),
  ],
);

export const productsRelations = relations(products, ({ one }) => ({
  taxRate: one(taxRates, { fields: [products.taxRateId], references: [taxRates.id] }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  client: one(clients, { fields: [opportunities.clientId], references: [clients.id] }),
  prospect: one(prospects, { fields: [opportunities.prospectId], references: [prospects.id] }),
  contact: one(contacts, { fields: [opportunities.contactId], references: [contacts.id] }),
  owner: one(users, { fields: [opportunities.ownerId], references: [users.id] }),
  stage: one(pipelineStages, {
    fields: [opportunities.stageId],
    references: [pipelineStages.id],
  }),
  source: one(prospectSources, {
    fields: [opportunities.sourceId],
    references: [prospectSources.id],
  }),
  products: many(opportunityProducts),
  history: many(opportunityStageHistory),
}));

export const opportunityProductsRelations = relations(opportunityProducts, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [opportunityProducts.opportunityId],
    references: [opportunities.id],
  }),
  product: one(products, { fields: [opportunityProducts.productId], references: [products.id] }),
}));

export const opportunityStageHistoryRelations = relations(opportunityStageHistory, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [opportunityStageHistory.opportunityId],
    references: [opportunities.id],
  }),
  fromStage: one(pipelineStages, {
    fields: [opportunityStageHistory.fromStageId],
    references: [pipelineStages.id],
    relationName: 'historyFromStage',
  }),
  toStage: one(pipelineStages, {
    fields: [opportunityStageHistory.toStageId],
    references: [pipelineStages.id],
    relationName: 'historyToStage',
  }),
  changedBy: one(users, {
    fields: [opportunityStageHistory.changedById],
    references: [users.id],
  }),
}));
