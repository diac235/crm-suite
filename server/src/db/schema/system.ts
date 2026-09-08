import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditActionEnum, entityTypeEnum, notificationKindEnum } from './enums';
import { users } from './security';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    entityType: entityTypeEnum('entity_type'),
    entityId: uuid('entity_id'),
    link: varchar('link', { length: 255 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_read_idx').on(t.userId, t.readAt),
    index('notifications_created_idx').on(t.createdAt),
  ],
);

/** Bitácora de auditoría: quién, cuándo, qué y con qué datos. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userEmail: varchar('user_email', { length: 190 }),
    action: auditActionEnum('action').notNull(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id'),
    entityLabel: varchar('entity_label', { length: 255 }),
    module: varchar('module', { length: 60 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_user_idx').on(t.userId),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_action_idx').on(t.action),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));
