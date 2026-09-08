import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { taxRates } from './catalogs';
import { clients, contacts } from './crm-core';
import { quoteStatusEnum, saleStatusEnum } from './enums';
import { opportunities, products } from './pipeline';
import { users } from './security';

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 30 }).notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    status: quoteStatusEnum('status').notNull().default('BORRADOR'),
    issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    discountTotal: numeric('discount_total', { precision: 14, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    terms: text('terms'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    decisionAt: timestamp('decision_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('quotes_client_idx').on(t.clientId),
    index('quotes_status_idx').on(t.status),
    index('quotes_owner_idx').on(t.ownerId),
    index('quotes_issue_date_idx').on(t.issueDate),
    index('quotes_valid_until_idx').on(t.validUntil),
    index('quotes_opportunity_idx').on(t.opportunityId),
  ],
);

export const quoteItems = pgTable(
  'quote_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    description: varchar('description', { length: 300 }).notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
    discountPct: numeric('discount_pct', { precision: 6, scale: 3 }).notNull().default('0'),
    taxRateId: uuid('tax_rate_id').references(() => taxRates.id, { onDelete: 'set null' }),
    taxPct: numeric('tax_pct', { precision: 6, scale: 3 }).notNull().default('0'),
    lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    lineDiscount: numeric('line_discount', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTax: numeric('line_tax', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('quote_items_quote_idx').on(t.quoteId), index('quote_items_product_idx').on(t.productId)],
);

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 30 }).notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    status: saleStatusEnum('status').notNull().default('PENDIENTE'),
    saleDate: timestamp('sale_date', { withTimezone: true }).notNull().defaultNow(),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('sales_client_idx').on(t.clientId),
    index('sales_status_idx').on(t.status),
    index('sales_date_idx').on(t.saleDate),
    index('sales_owner_idx').on(t.ownerId),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    description: varchar('description', { length: 300 }).notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [index('sale_items_sale_idx').on(t.saleId), index('sale_items_product_idx').on(t.productId)],
);

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  client: one(clients, { fields: [quotes.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [quotes.contactId], references: [contacts.id] }),
  opportunity: one(opportunities, {
    fields: [quotes.opportunityId],
    references: [opportunities.id],
  }),
  owner: one(users, { fields: [quotes.ownerId], references: [users.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
  product: one(products, { fields: [quoteItems.productId], references: [products.id] }),
  taxRate: one(taxRates, { fields: [quoteItems.taxRateId], references: [taxRates.id] }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  client: one(clients, { fields: [sales.clientId], references: [clients.id] }),
  opportunity: one(opportunities, {
    fields: [sales.opportunityId],
    references: [opportunities.id],
  }),
  quote: one(quotes, { fields: [sales.quoteId], references: [quotes.id] }),
  owner: one(users, { fields: [sales.ownerId], references: [users.id] }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
}));
