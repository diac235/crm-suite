import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { prospectSources, sectors } from './catalogs';
import { clientKindEnum, clientStatusEnum, prospectStatusEnum, temperatureEnum } from './enums';
import { users } from './security';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    kind: clientKindEnum('kind').notNull().default('EMPRESA'),
    /** RUC / cédula / identificación fiscal. */
    taxId: varchar('tax_id', { length: 30 }),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    tradeName: varchar('trade_name', { length: 200 }),
    address: text('address'),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    country: varchar('country', { length: 120 }).notNull().default('Ecuador'),
    phone: varchar('phone', { length: 40 }),
    mobile: varchar('mobile', { length: 40 }),
    email: varchar('email', { length: 190 }),
    website: varchar('website', { length: 190 }),
    sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
    economicActivity: varchar('economic_activity', { length: 200 }),
    status: clientStatusEnum('status').notNull().default('ACTIVO'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }),
    notes: text('notes'),
    convertedFromProspectId: uuid('converted_from_prospect_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Evita clientes duplicados por identificación mientras no estén eliminados.
    uniqueIndex('clients_tax_id_unique')
      .on(t.taxId)
      .where(sql`${t.deletedAt} IS NULL`),
    index('clients_legal_name_idx').on(t.legalName),
    index('clients_trade_name_idx').on(t.tradeName),
    index('clients_status_idx').on(t.status),
    index('clients_owner_idx').on(t.ownerId),
    index('clients_sector_idx').on(t.sectorId),
    index('clients_created_idx').on(t.createdAt),
    index('clients_email_idx').on(t.email),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 80 }).notNull(),
    lastName: varchar('last_name', { length: 80 }).notNull(),
    position: varchar('position', { length: 120 }),
    department: varchar('department', { length: 120 }),
    email: varchar('email', { length: 190 }),
    phone: varchar('phone', { length: 40 }),
    mobile: varchar('mobile', { length: 40 }),
    whatsapp: varchar('whatsapp', { length: 40 }),
    birthDate: date('birth_date'),
    isPrimary: boolean('is_primary').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('contacts_client_idx').on(t.clientId),
    index('contacts_last_name_idx').on(t.lastName),
    index('contacts_email_idx').on(t.email),
    index('contacts_primary_idx').on(t.clientId, t.isPrimary),
  ],
);

export const prospects = pgTable(
  'prospects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    firstName: varchar('first_name', { length: 80 }).notNull(),
    lastName: varchar('last_name', { length: 80 }),
    companyName: varchar('company_name', { length: 200 }),
    taxId: varchar('tax_id', { length: 30 }),
    position: varchar('position', { length: 120 }),
    phone: varchar('phone', { length: 40 }),
    mobile: varchar('mobile', { length: 40 }),
    email: varchar('email', { length: 190 }),
    sourceId: uuid('source_id').references(() => prospectSources.id, { onDelete: 'set null' }),
    sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    status: prospectStatusEnum('status').notNull().default('NUEVO'),
    temperature: temperatureEnum('temperature').notNull().default('TIBIO'),
    estimatedValue: numeric('estimated_value', { precision: 14, scale: 2 }),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    lostReason: text('lost_reason'),
    notes: text('notes'),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    convertedClientId: uuid('converted_client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('prospects_status_idx').on(t.status),
    index('prospects_owner_idx').on(t.ownerId),
    index('prospects_temperature_idx').on(t.temperature),
    index('prospects_follow_up_idx').on(t.nextFollowUpAt),
    index('prospects_last_name_idx').on(t.lastName),
    index('prospects_company_idx').on(t.companyName),
    index('prospects_email_idx').on(t.email),
  ],
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
  sector: one(sectors, { fields: [clients.sectorId], references: [sectors.id] }),
  owner: one(users, { fields: [clients.ownerId], references: [users.id] }),
  contacts: many(contacts),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  client: one(clients, { fields: [contacts.clientId], references: [clients.id] }),
}));

export const prospectsRelations = relations(prospects, ({ one }) => ({
  source: one(prospectSources, { fields: [prospects.sourceId], references: [prospectSources.id] }),
  sector: one(sectors, { fields: [prospects.sectorId], references: [sectors.id] }),
  owner: one(users, { fields: [prospects.ownerId], references: [users.id] }),
  convertedClient: one(clients, {
    fields: [prospects.convertedClientId],
    references: [clients.id],
  }),
}));
