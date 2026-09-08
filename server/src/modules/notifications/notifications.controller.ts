import type { Request, Response } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { notifications } from '../../db/schema';
import { ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, paginationSchema } from '../../core/pagination';
import { combine } from '../../core/query';
import {
  markAllAsRead,
  markAsRead,
  refreshAutomaticNotifications,
} from '../../services/notification.service';

export const listNotificationsSchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().default(false),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as z.infer<typeof listNotificationsSchema>;
  const where = combine(
    eq(notifications.userId, req.user!.id),
    query.unreadOnly ? isNull(notifications.readAt) : undefined,
  );

  const [rows, [total], [unread]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(notifications).where(where),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt))),
  ]);

  res.status(200).json({
    success: true,
    data: rows,
    meta: { ...buildMeta(query.page, query.pageSize, total?.value ?? 0), unread: unread?.value ?? 0 },
  });
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
  ok(res, { unread: row?.value ?? 0 });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as z.infer<typeof markReadSchema>;
  const updated = await markAsRead(req.user!.id, ids);
  ok(res, { updated });
}

export async function markAll(req: Request, res: Response): Promise<void> {
  const updated = await markAllAsRead(req.user!.id);
  ok(res, { updated });
}

/** Fuerza el recálculo de notificaciones automáticas (útil tras cambios masivos). */
export async function refresh(_req: Request, res: Response): Promise<void> {
  const created = await refreshAutomaticNotifications();
  ok(res, { evaluated: created });
}

