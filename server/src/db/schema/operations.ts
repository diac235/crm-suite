import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { activityTypes } from './catalogs';
import { clients, contacts, prospects } from './crm-core';
import {
  activityStatusEnum,
  documentCategoryEnum,
  taskPriorityEnum,
  taskStatusEnum,
} from './enums';
import { quotes } from './commerce';
import { opportunities } from './pipeline';
import { users } from './security';

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    typeId: uuid('type_id')
      .notNull()
      .references(() => activityTypes.id, { onDelete: 'restrict' }),
    subject: varchar('subject', { length: 200 }).notNull(),
    description: text('description'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    status: activityStatusEnum('status').notNull().default('PENDIENTE'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull().default(30),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    location: varchar('location', { length: 200 }),
    outcome: text('outcome'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('activities_client_idx').on(t.clientId),
    index('activities_prospect_idx').on(t.prospectId),
    index('activities_opportunity_idx').on(t.opportunityId),
    index('activities_owner_idx').on(t.ownerId),
    index('activities_status_idx').on(t.status),
    index('activities_scheduled_idx').on(t.scheduledAt),
    index('activities_type_idx').on(t.typeId),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    priority: taskPriorityEnum('priority').notNull().default('MEDIA'),
    status: taskStatusEnum('status').notNull().default('PENDIENTE'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('tasks_assignee_idx').on(t.assigneeId),
    index('tasks_status_idx').on(t.status),
    index('tasks_due_idx').on(t.dueAt),
    index('tasks_priority_idx').on(t.priority),
    index('tasks_client_idx').on(t.clientId),
    index('tasks_opportunity_idx').on(t.opportunityId),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_comments_task_idx').on(t.taskId)],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull().unique(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    category: documentCategoryEnum('category').notNull().default('OTRO'),
    checksum: varchar('checksum', { length: 64 }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('documents_client_idx').on(t.clientId),
    index('documents_prospect_idx').on(t.prospectId),
    index('documents_opportunity_idx').on(t.opportunityId),
    index('documents_created_idx').on(t.createdAt),
  ],
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    body: text('body').notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('notes_client_idx').on(t.clientId),
    index('notes_prospect_idx').on(t.prospectId),
    index('notes_opportunity_idx').on(t.opportunityId),
  ],
);

export const activitiesRelations = relations(activities, ({ one }) => ({
  type: one(activityTypes, { fields: [activities.typeId], references: [activityTypes.id] }),
  client: one(clients, { fields: [activities.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  prospect: one(prospects, { fields: [activities.prospectId], references: [prospects.id] }),
  opportunity: one(opportunities, {
    fields: [activities.opportunityId],
    references: [opportunities.id],
  }),
  owner: one(users, { fields: [activities.ownerId], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: 'taskAssignee',
  }),
  createdBy: one(users, {
    fields: [tasks.createdById],
    references: [users.id],
    relationName: 'taskCreator',
  }),
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  prospect: one(prospects, { fields: [tasks.prospectId], references: [prospects.id] }),
  opportunity: one(opportunities, {
    fields: [tasks.opportunityId],
    references: [opportunities.id],
  }),
  comments: many(taskComments),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  prospect: one(prospects, { fields: [documents.prospectId], references: [prospects.id] }),
  opportunity: one(opportunities, {
    fields: [documents.opportunityId],
    references: [opportunities.id],
  }),
  quote: one(quotes, { fields: [documents.quoteId], references: [quotes.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  client: one(clients, { fields: [notes.clientId], references: [clients.id] }),
  prospect: one(prospects, { fields: [notes.prospectId], references: [prospects.id] }),
  opportunity: one(opportunities, {
    fields: [notes.opportunityId],
    references: [opportunities.id],
  }),
  author: one(users, { fields: [notes.authorId], references: [users.id] }),
}));
