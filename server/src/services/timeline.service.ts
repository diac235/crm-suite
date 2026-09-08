import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  activities,
  activityTypes,
  auditLogs,
  clients,
  documents,
  notes,
  opportunities,
  quotes,
  sales,
  tasks,
  users,
} from '../db/schema';

export type TimelineKind =
  | 'CREACION'
  | 'ACTIVIDAD'
  | 'OPORTUNIDAD'
  | 'COTIZACION'
  | 'VENTA'
  | 'TAREA'
  | 'NOTA'
  | 'DOCUMENTO'
  | 'CAMBIO';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  description: string | null;
  occurredAt: Date;
  actor: string | null;
  entityId: string | null;
  meta?: Record<string, unknown>;
}

function fullName(first?: string | null, last?: string | null): string | null {
  const value = `${first ?? ''} ${last ?? ''}`.trim();
  return value.length > 0 ? value : null;
}

/**
 * Historial cronológico completo de un cliente.
 * Une actividades, oportunidades, cotizaciones, ventas, tareas, notas,
 * documentos y cambios auditados en una sola línea de tiempo.
 */
export async function getClientTimeline(clientId: string, limit = 200): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  const [client] = await db
    .select({
      id: clients.id,
      legalName: clients.legalName,
      createdAt: clients.createdAt,
      ownerFirst: users.firstName,
      ownerLast: users.lastName,
    })
    .from(clients)
    .leftJoin(users, eq(clients.ownerId, users.id))
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return events;

  events.push({
    id: `client-${client.id}`,
    kind: 'CREACION',
    title: 'Cliente registrado en el CRM',
    description: client.legalName,
    occurredAt: client.createdAt,
    actor: fullName(client.ownerFirst, client.ownerLast),
    entityId: client.id,
  });

  const activityRows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      description: activities.description,
      outcome: activities.outcome,
      scheduledAt: activities.scheduledAt,
      status: activities.status,
      typeName: activityTypes.name,
      typeCode: activityTypes.code,
      ownerFirst: users.firstName,
      ownerLast: users.lastName,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(users, eq(activities.ownerId, users.id))
    .where(and(eq(activities.clientId, clientId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.scheduledAt))
    .limit(limit);

  for (const row of activityRows) {
    events.push({
      id: `activity-${row.id}`,
      kind: 'ACTIVIDAD',
      title: `${row.typeName}: ${row.subject}`,
      description: row.outcome ?? row.description,
      occurredAt: row.scheduledAt,
      actor: fullName(row.ownerFirst, row.ownerLast),
      entityId: row.id,
      meta: { status: row.status, typeCode: row.typeCode },
    });
  }

  const opportunityRows = await db
    .select({
      id: opportunities.id,
      code: opportunities.code,
      name: opportunities.name,
      amount: opportunities.amount,
      status: opportunities.status,
      createdAt: opportunities.createdAt,
      ownerFirst: users.firstName,
      ownerLast: users.lastName,
    })
    .from(opportunities)
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(and(eq(opportunities.clientId, clientId), isNull(opportunities.deletedAt)))
    .orderBy(desc(opportunities.createdAt))
    .limit(limit);

  for (const row of opportunityRows) {
    events.push({
      id: `opportunity-${row.id}`,
      kind: 'OPORTUNIDAD',
      title: `Oportunidad ${row.code}: ${row.name}`,
      // La presentación (moneda, etiquetas) se resuelve en la interfaz.
      description: null,
      occurredAt: row.createdAt,
      actor: fullName(row.ownerFirst, row.ownerLast),
      entityId: row.id,
      meta: { status: row.status, amount: row.amount },
    });
  }

  const quoteRows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      total: quotes.total,
      status: quotes.status,
      issueDate: quotes.issueDate,
      ownerFirst: users.firstName,
      ownerLast: users.lastName,
    })
    .from(quotes)
    .leftJoin(users, eq(quotes.ownerId, users.id))
    .where(and(eq(quotes.clientId, clientId), isNull(quotes.deletedAt)))
    .orderBy(desc(quotes.issueDate))
    .limit(limit);

  for (const row of quoteRows) {
    events.push({
      id: `quote-${row.id}`,
      kind: 'COTIZACION',
      title: `Cotización ${row.number}`,
      description: null,
      occurredAt: row.issueDate,
      actor: fullName(row.ownerFirst, row.ownerLast),
      entityId: row.id,
      meta: { status: row.status, total: row.total },
    });
  }

  const saleRows = await db
    .select({
      id: sales.id,
      number: sales.number,
      total: sales.total,
      status: sales.status,
      saleDate: sales.saleDate,
      ownerFirst: users.firstName,
      ownerLast: users.lastName,
    })
    .from(sales)
    .leftJoin(users, eq(sales.ownerId, users.id))
    .where(and(eq(sales.clientId, clientId), isNull(sales.deletedAt)))
    .orderBy(desc(sales.saleDate))
    .limit(limit);

  for (const row of saleRows) {
    events.push({
      id: `sale-${row.id}`,
      kind: 'VENTA',
      title: `Venta ${row.number}`,
      description: null,
      occurredAt: row.saleDate,
      actor: fullName(row.ownerFirst, row.ownerLast),
      entityId: row.id,
      meta: { status: row.status, total: row.total },
    });
  }

  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      assigneeFirst: users.firstName,
      assigneeLast: users.lastName,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.clientId, clientId), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.createdAt))
    .limit(limit);

  for (const row of taskRows) {
    events.push({
      id: `task-${row.id}`,
      kind: 'TAREA',
      title: `Tarea: ${row.title}`,
      description: null,
      occurredAt: row.createdAt,
      actor: fullName(row.assigneeFirst, row.assigneeLast),
      entityId: row.id,
      meta: { status: row.status, priority: row.priority },
    });
  }

  const noteRows = await db
    .select({
      id: notes.id,
      body: notes.body,
      createdAt: notes.createdAt,
      authorFirst: users.firstName,
      authorLast: users.lastName,
    })
    .from(notes)
    .leftJoin(users, eq(notes.authorId, users.id))
    .where(and(eq(notes.clientId, clientId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.createdAt))
    .limit(limit);

  for (const row of noteRows) {
    events.push({
      id: `note-${row.id}`,
      kind: 'NOTA',
      title: 'Nota',
      description: row.body,
      occurredAt: row.createdAt,
      actor: fullName(row.authorFirst, row.authorLast),
      entityId: row.id,
    });
  }

  const documentRows = await db
    .select({
      id: documents.id,
      name: documents.name,
      category: documents.category,
      createdAt: documents.createdAt,
      uploaderFirst: users.firstName,
      uploaderLast: users.lastName,
    })
    .from(documents)
    .leftJoin(users, eq(documents.uploadedById, users.id))
    .where(and(eq(documents.clientId, clientId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt))
    .limit(limit);

  for (const row of documentRows) {
    events.push({
      id: `document-${row.id}`,
      kind: 'DOCUMENTO',
      title: `Documento: ${row.name}`,
      description: null,
      meta: { category: row.category },
      occurredAt: row.createdAt,
      actor: fullName(row.uploaderFirst, row.uploaderLast),
      entityId: row.id,
    });
  }

  const changeRows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      module: auditLogs.module,
      entityLabel: auditLogs.entityLabel,
      after: auditLogs.after,
      createdAt: auditLogs.createdAt,
      userEmail: auditLogs.userEmail,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityId, clientId),
        or(eq(auditLogs.action, 'UPDATE'), eq(auditLogs.action, 'STATUS_CHANGE'), eq(auditLogs.action, 'CONVERT')),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  for (const row of changeRows) {
    events.push({
      id: `audit-${row.id}`,
      kind: 'CAMBIO',
      title: 'Actualización del registro',
      description: row.after ? Object.keys(row.after as object).join(', ') : null,
      occurredAt: row.createdAt,
      actor: row.userEmail,
      entityId: clientId,
      meta: { action: row.action, module: row.module },
    });
  }

  return events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, limit);
}

/** Indicadores resumidos que se muestran en la ficha del cliente. */
export async function getClientSummary(clientId: string) {
  const [row] = await db
    .select({
      opportunitiesOpen: sql<number>`COUNT(DISTINCT CASE WHEN o.status = 'ABIERTA' THEN o.id END)`,
      opportunitiesWon: sql<number>`COUNT(DISTINCT CASE WHEN o.status = 'GANADA' THEN o.id END)`,
      opportunitiesLost: sql<number>`COUNT(DISTINCT CASE WHEN o.status = 'PERDIDA' THEN o.id END)`,
      pipelineValue: sql<string>`COALESCE(SUM(DISTINCT CASE WHEN o.status = 'ABIERTA' THEN o.amount END), 0)`,
    })
    .from(sql`opportunities o`)
    .where(sql`o.client_id = ${clientId} AND o.deleted_at IS NULL`);

  const [quoteRow] = await db
    .select({
      quotesTotal: sql<number>`COUNT(*)`,
      quotesAccepted: sql<number>`COUNT(*) FILTER (WHERE status = 'ACEPTADA')`,
      quotesPending: sql<number>`COUNT(*) FILTER (WHERE status IN ('ENVIADA','EN_NEGOCIACION'))`,
    })
    .from(quotes)
    .where(and(eq(quotes.clientId, clientId), isNull(quotes.deletedAt)));

  const [saleRow] = await db
    .select({
      salesCount: sql<number>`COUNT(*)`,
      salesTotal: sql<string>`COALESCE(SUM(total), 0)`,
      salesPending: sql<string>`COALESCE(SUM(total) FILTER (WHERE status = 'PENDIENTE'), 0)`,
    })
    .from(sales)
    .where(and(eq(sales.clientId, clientId), isNull(sales.deletedAt)));

  const [activityRow] = await db
    .select({
      activitiesTotal: sql<number>`COUNT(*)`,
      activitiesPending: sql<number>`COUNT(*) FILTER (WHERE status IN ('PENDIENTE','EN_PROGRESO'))`,
      lastInteractionAt: sql<Date | null>`MAX(scheduled_at) FILTER (WHERE status = 'COMPLETADA')`,
    })
    .from(activities)
    .where(and(eq(activities.clientId, clientId), isNull(activities.deletedAt)));

  return {
    ...row,
    ...quoteRow,
    ...saleRow,
    ...activityRow,
  };
}
