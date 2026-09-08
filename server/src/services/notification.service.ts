import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  activities,
  activityTypes,
  notifications,
  opportunities,
  prospects,
  quotes,
  tasks,
} from '../db/schema';
import { logger } from '../config/logger';

type NotificationKind = (typeof notifications.kind.enumValues)[number];
type EntityType = (typeof notifications.entityType.enumValues)[number];

export interface CreateNotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  entityType?: EntityType | null;
  entityId?: string | null;
  link?: string | null;
}

/** Crea una notificación evitando duplicados no leídos del mismo evento. */
export async function pushNotification(input: CreateNotificationInput): Promise<void> {
  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.kind, input.kind),
        input.entityId ? eq(notifications.entityId, input.entityId) : sql`TRUE`,
        isNull(notifications.readAt),
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(notifications).values({
    userId: input.userId,
    kind: input.kind,
    title: input.title.slice(0, 200),
    body: input.body ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  });
}

export async function notifyAssignment(input: {
  userId: string | null | undefined;
  actorId: string;
  title: string;
  body?: string;
  entityType: EntityType;
  entityId: string;
  link: string;
}): Promise<void> {
  if (!input.userId || input.userId === input.actorId) return;
  await db.insert(notifications).values({
    userId: input.userId,
    kind: 'ASIGNACION',
    title: input.title.slice(0, 200),
    body: input.body ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    link: input.link,
  });
}

/**
 * Recalcula las notificaciones automáticas del sistema.
 * Idempotente: puede ejecutarse cada pocos minutos sin generar duplicados.
 */
export async function refreshAutomaticNotifications(now = new Date()): Promise<number> {
  let created = 0;
  const in24h = new Date(now.getTime() + 24 * 3_600_000);
  const in72h = new Date(now.getTime() + 72 * 3_600_000);
  const days15Ago = new Date(now.getTime() - 15 * 86_400_000);

  try {
    // 1. Tareas vencidas y tareas que vencen en las próximas 24 horas.
    const dueTasks = await db
      .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, assigneeId: tasks.assigneeId })
      .from(tasks)
      .where(
        and(
          isNull(tasks.deletedAt),
          isNotNull(tasks.assigneeId),
          isNotNull(tasks.dueAt),
          inArray(tasks.status, ['PENDIENTE', 'EN_PROGRESO']),
          lte(tasks.dueAt, in24h),
        ),
      );

    for (const task of dueTasks) {
      const overdue = task.dueAt! < now;
      await pushNotification({
        userId: task.assigneeId!,
        kind: overdue ? 'TAREA_VENCIDA' : 'TAREA_PROXIMA',
        title: overdue ? `Tarea vencida: ${task.title}` : `Tarea próxima: ${task.title}`,
        body: `Vence el ${task.dueAt!.toLocaleString('es-EC')}`,
        entityType: 'TASK',
        entityId: task.id,
        link: `/tareas?id=${task.id}`,
      });
      created += 1;
    }

    // 2. Seguimientos de prospectos vencidos o para hoy.
    const followUps = await db
      .select({
        id: prospects.id,
        firstName: prospects.firstName,
        lastName: prospects.lastName,
        companyName: prospects.companyName,
        nextFollowUpAt: prospects.nextFollowUpAt,
        ownerId: prospects.ownerId,
      })
      .from(prospects)
      .where(
        and(
          isNull(prospects.deletedAt),
          isNotNull(prospects.ownerId),
          isNotNull(prospects.nextFollowUpAt),
          lte(prospects.nextFollowUpAt, in24h),
          inArray(prospects.status, ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'EN_NEGOCIACION']),
        ),
      );

    for (const p of followUps) {
      const label = p.companyName ?? `${p.firstName} ${p.lastName ?? ''}`.trim();
      await pushNotification({
        userId: p.ownerId!,
        kind: 'SEGUIMIENTO_PENDIENTE',
        title: `Seguimiento pendiente: ${label}`,
        body: `Programado para el ${p.nextFollowUpAt!.toLocaleString('es-EC')}`,
        entityType: 'PROSPECT',
        entityId: p.id,
        link: `/prospectos/${p.id}`,
      });
      created += 1;
    }

    // 3. Reuniones en las próximas 24 horas.
    const meetings = await db
      .select({
        id: activities.id,
        subject: activities.subject,
        scheduledAt: activities.scheduledAt,
        ownerId: activities.ownerId,
      })
      .from(activities)
      .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
      .where(
        and(
          isNull(activities.deletedAt),
          isNotNull(activities.ownerId),
          eq(activityTypes.code, 'REUNION'),
          inArray(activities.status, ['PENDIENTE', 'EN_PROGRESO']),
          gte(activities.scheduledAt, now),
          lte(activities.scheduledAt, in24h),
        ),
      );

    for (const m of meetings) {
      await pushNotification({
        userId: m.ownerId!,
        kind: 'REUNION_PROXIMA',
        title: `Reunión próxima: ${m.subject}`,
        body: `Programada para el ${m.scheduledAt.toLocaleString('es-EC')}`,
        entityType: 'ACTIVITY',
        entityId: m.id,
        link: `/calendario?id=${m.id}`,
      });
      created += 1;
    }

    // 4. Cotizaciones que vencen en 72 horas.
    const expiring = await db
      .select({
        id: quotes.id,
        number: quotes.number,
        validUntil: quotes.validUntil,
        ownerId: quotes.ownerId,
      })
      .from(quotes)
      .where(
        and(
          isNull(quotes.deletedAt),
          isNotNull(quotes.ownerId),
          inArray(quotes.status, ['ENVIADA', 'EN_NEGOCIACION']),
          gte(quotes.validUntil, now),
          lte(quotes.validUntil, in72h),
        ),
      );

    for (const q of expiring) {
      await pushNotification({
        userId: q.ownerId!,
        kind: 'COTIZACION_POR_VENCER',
        title: `Cotización por vencer: ${q.number}`,
        body: `Vigencia hasta el ${q.validUntil.toLocaleDateString('es-EC')}`,
        entityType: 'QUOTE',
        entityId: q.id,
        link: `/cotizaciones/${q.id}`,
      });
      created += 1;
    }

    // 5. Oportunidades abiertas sin actividad en los últimos 15 días.
    const stale = await db
      .select({
        id: opportunities.id,
        name: opportunities.name,
        ownerId: opportunities.ownerId,
      })
      .from(opportunities)
      .where(
        and(
          isNull(opportunities.deletedAt),
          isNotNull(opportunities.ownerId),
          eq(opportunities.status, 'ABIERTA'),
          lt(opportunities.updatedAt, days15Ago),
          sql`NOT EXISTS (
            SELECT 1 FROM activities a
            WHERE a.opportunity_id = ${opportunities.id}
              AND a.deleted_at IS NULL
              AND a.created_at >= ${days15Ago}
          )`,
        ),
      );

    for (const o of stale) {
      await pushNotification({
        userId: o.ownerId!,
        kind: 'OPORTUNIDAD_SIN_SEGUIMIENTO',
        title: `Oportunidad sin seguimiento: ${o.name}`,
        body: 'No registra actividades en los últimos 15 días',
        entityType: 'OPPORTUNITY',
        entityId: o.id,
        link: `/oportunidades/${o.id}`,
      });
      created += 1;
    }

    // 6. Marcar cotizaciones vencidas automáticamente.
    await db
      .update(quotes)
      .set({ status: 'VENCIDA', updatedAt: now })
      .where(
        and(
          isNull(quotes.deletedAt),
          inArray(quotes.status, ['ENVIADA', 'EN_NEGOCIACION']),
          lt(quotes.validUntil, now),
        ),
      );
  } catch (err) {
    logger.error({ err }, 'Fallo al recalcular notificaciones automáticas');
  }

  return created;
}

export async function markAsRead(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

