import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ok } from '../../core/http';
import { periodSchema, resolveRange, type PeriodQuery } from '../../core/dates';
import { canSeeAllRecords } from '../../middlewares/auth';
import { UnauthorizedError } from '../../core/errors';

export { periodSchema };

interface ScopeSql {
  clients: ReturnType<typeof sql.raw>;
  prospects: ReturnType<typeof sql.raw>;
  opportunities: ReturnType<typeof sql.raw>;
  quotes: ReturnType<typeof sql.raw>;
  sales: ReturnType<typeof sql.raw>;
  activities: ReturnType<typeof sql.raw>;
  tasks: ReturnType<typeof sql.raw>;
}

/**
 * Restringe las métricas a la cartera del usuario cuando no tiene
 * permisos de administración sobre el módulo correspondiente.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildScope(req: Request): { scope: ScopeSql; userId: string } {
  const userId = req.user!.id;
  // Defensa en profundidad: el identificador se interpola en SQL, así que se
  // valida su formato aunque provenga de un token ya verificado.
  if (!UUID_PATTERN.test(userId)) {
    throw new UnauthorizedError('Sesión inválida');
  }
  const all = (module: string) => canSeeAllRecords(req, module);
  return {
    userId,
    scope: {
      clients: all('clients') ? sql.raw('TRUE') : sql.raw(`owner_id = '${userId}'`),
      prospects: all('prospects') ? sql.raw('TRUE') : sql.raw(`owner_id = '${userId}'`),
      opportunities: all('opportunities') ? sql.raw('TRUE') : sql.raw(`owner_id = '${userId}'`),
      quotes: all('quotes') ? sql.raw('TRUE') : sql.raw(`owner_id = '${userId}'`),
      sales: all('sales') ? sql.raw('TRUE') : sql.raw(`owner_id = '${userId}'`),
      activities: all('activities') ? sql.raw('TRUE') : sql.raw(`owner_id = '${userId}'`),
      tasks: all('tasks') ? sql.raw('TRUE') : sql.raw(`assignee_id = '${userId}'`),
    },
  };
}

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

export async function summary(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as PeriodQuery;
  const range = resolveRange(query);
  const { scope } = buildScope(req);

  const kpis = rowsOf<Record<string, string>>(
    await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND status <> 'ARCHIVADO' AND ${scope.clients}) AS "clientsTotal",
        (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND created_at BETWEEN ${range.from} AND ${range.to} AND ${scope.clients}) AS "clientsNew",
        (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND created_at BETWEEN ${range.previousFrom} AND ${range.previousTo} AND ${scope.clients}) AS "clientsNewPrev",
        (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND status = 'ACTIVO' AND ${scope.clients}) AS "clientsActive",
        (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND status = 'INACTIVO' AND ${scope.clients}) AS "clientsInactive",

        (SELECT COUNT(*) FROM prospects WHERE deleted_at IS NULL AND status NOT IN ('CONVERTIDO','PERDIDO') AND ${scope.prospects}) AS "prospectsOpen",
        (SELECT COUNT(*) FROM prospects WHERE deleted_at IS NULL AND entered_at BETWEEN ${range.from} AND ${range.to} AND ${scope.prospects}) AS "prospectsNew",
        (SELECT COUNT(*) FROM prospects WHERE deleted_at IS NULL AND entered_at BETWEEN ${range.previousFrom} AND ${range.previousTo} AND ${scope.prospects}) AS "prospectsNewPrev",
        (SELECT COUNT(*) FROM prospects WHERE deleted_at IS NULL AND converted_at BETWEEN ${range.from} AND ${range.to} AND ${scope.prospects}) AS "prospectsConverted",

        (SELECT COUNT(*) FROM opportunities WHERE deleted_at IS NULL AND status = 'ABIERTA' AND ${scope.opportunities}) AS "opportunitiesOpen",
        (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE deleted_at IS NULL AND status = 'ABIERTA' AND ${scope.opportunities}) AS "pipelineValue",
        (SELECT COALESCE(SUM(amount * probability / 100.0),0) FROM opportunities WHERE deleted_at IS NULL AND status = 'ABIERTA' AND ${scope.opportunities}) AS "pipelineWeighted",
        (SELECT COUNT(*) FROM opportunities WHERE deleted_at IS NULL AND status = 'GANADA' AND closed_at BETWEEN ${range.from} AND ${range.to} AND ${scope.opportunities}) AS "opportunitiesWon",
        (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE deleted_at IS NULL AND status = 'GANADA' AND closed_at BETWEEN ${range.from} AND ${range.to} AND ${scope.opportunities}) AS "opportunitiesWonValue",
        (SELECT COUNT(*) FROM opportunities WHERE deleted_at IS NULL AND status = 'PERDIDA' AND closed_at BETWEEN ${range.from} AND ${range.to} AND ${scope.opportunities}) AS "opportunitiesLost",

        (SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL AND status IN ('ENVIADA','EN_NEGOCIACION') AND issue_date BETWEEN ${range.from} AND ${range.to} AND ${scope.quotes}) AS "quotesSent",
        (SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL AND status = 'ACEPTADA' AND issue_date BETWEEN ${range.from} AND ${range.to} AND ${scope.quotes}) AS "quotesAccepted",
        (SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL AND status = 'RECHAZADA' AND issue_date BETWEEN ${range.from} AND ${range.to} AND ${scope.quotes}) AS "quotesRejected",
        (SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL AND status IN ('ENVIADA','EN_NEGOCIACION') AND valid_until BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND ${scope.quotes}) AS "quotesExpiringSoon",

        (SELECT COALESCE(SUM(total),0) FROM sales WHERE deleted_at IS NULL AND status <> 'ANULADA' AND sale_date BETWEEN ${range.from} AND ${range.to} AND ${scope.sales}) AS "salesTotal",
        (SELECT COALESCE(SUM(total),0) FROM sales WHERE deleted_at IS NULL AND status <> 'ANULADA' AND sale_date BETWEEN ${range.previousFrom} AND ${range.previousTo} AND ${scope.sales}) AS "salesTotalPrev",
        (SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL AND status <> 'ANULADA' AND sale_date BETWEEN ${range.from} AND ${range.to} AND ${scope.sales}) AS "salesCount",
        (SELECT COALESCE(SUM(total),0) FROM sales WHERE deleted_at IS NULL AND status = 'PENDIENTE' AND ${scope.sales}) AS "salesPending",

        (SELECT COUNT(*) FROM activities WHERE deleted_at IS NULL AND status IN ('PENDIENTE','EN_PROGRESO') AND ${scope.activities}) AS "activitiesPending",
        (SELECT COUNT(*) FROM activities WHERE deleted_at IS NULL AND status = 'COMPLETADA' AND scheduled_at BETWEEN ${range.from} AND ${range.to} AND ${scope.activities}) AS "activitiesCompleted",

        (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status IN ('PENDIENTE','EN_PROGRESO') AND due_at < NOW() AND ${scope.tasks}) AS "tasksOverdue",
        (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status IN ('PENDIENTE','EN_PROGRESO') AND ${scope.tasks}) AS "tasksPending",

        (SELECT COUNT(*) FROM prospects WHERE deleted_at IS NULL AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= NOW() AND status NOT IN ('CONVERTIDO','PERDIDO') AND ${scope.prospects}) AS "followUpsPending"
    `),
  )[0]!;

  const upcomingMeetings = rowsOf(
    await db.execute(sql`
      SELECT a.id, a.subject, a.scheduled_at AS "scheduledAt", a.duration_min AS "durationMin",
             at.name AS "typeName", at.color AS "typeColor",
             c.legal_name AS "clientName"
      FROM activities a
      INNER JOIN activity_types at ON at.id = a.type_id
      LEFT JOIN clients c ON c.id = a.client_id
      WHERE a.deleted_at IS NULL
        AND a.status IN ('PENDIENTE','EN_PROGRESO')
        AND a.scheduled_at >= NOW()
        AND ${scope.activities}
      ORDER BY a.scheduled_at ASC
      LIMIT 8
    `),
  );

  const overdueTasks = rowsOf(
    await db.execute(sql`
      SELECT t.id, t.title, t.due_at AS "dueAt", t.priority, c.legal_name AS "clientName"
      FROM tasks t
      LEFT JOIN clients c ON c.id = t.client_id
      WHERE t.deleted_at IS NULL
        AND t.status IN ('PENDIENTE','EN_PROGRESO')
        AND t.due_at < NOW()
        AND ${scope.tasks}
      ORDER BY t.due_at ASC
      LIMIT 8
    `),
  );

  const pendingFollowUps = rowsOf(
    await db.execute(sql`
      SELECT p.id, p.code, p.first_name AS "firstName", p.last_name AS "lastName",
             p.company_name AS "companyName", p.next_follow_up_at AS "nextFollowUpAt", p.temperature
      FROM prospects p
      WHERE p.deleted_at IS NULL
        AND p.next_follow_up_at IS NOT NULL
        AND p.next_follow_up_at <= NOW() + INTERVAL '3 days'
        AND p.status NOT IN ('CONVERTIDO','PERDIDO')
        AND ${scope.prospects}
      ORDER BY p.next_follow_up_at ASC
      LIMIT 8
    `),
  );

  ok(res, {
    range: { from: range.from, to: range.to, period: query.period },
    kpis,
    upcomingMeetings,
    overdueTasks,
    pendingFollowUps,
  });
}

export async function charts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as PeriodQuery;
  const range = resolveRange(query);
  const { scope } = buildScope(req);

  const salesTrend = rowsOf(
    await db.execute(sql`
      SELECT to_char(date_trunc('day', sale_date), 'YYYY-MM-DD') AS "date",
             COALESCE(SUM(total), 0)::numeric(14,2) AS "total",
             COUNT(*)::int AS "count"
      FROM sales
      WHERE deleted_at IS NULL AND status <> 'ANULADA'
        AND sale_date BETWEEN ${range.from} AND ${range.to}
        AND ${scope.sales}
      GROUP BY 1 ORDER BY 1
    `),
  );

  const pipelineByStage = rowsOf(
    await db.execute(sql`
      SELECT ps.name AS "stage", ps.color, ps."order",
             COUNT(o.id)::int AS "count",
             COALESCE(SUM(o.amount), 0)::numeric(14,2) AS "total"
      FROM pipeline_stages ps
      LEFT JOIN opportunities o
        ON o.stage_id = ps.id AND o.deleted_at IS NULL AND o.status = 'ABIERTA' AND ${scope.opportunities}
      WHERE ps.is_active = TRUE
      GROUP BY ps.id, ps.name, ps.color, ps."order"
      ORDER BY ps."order"
    `),
  );

  const opportunitiesOutcome = rowsOf(
    await db.execute(sql`
      SELECT status, COUNT(*)::int AS "count", COALESCE(SUM(amount),0)::numeric(14,2) AS "total"
      FROM opportunities
      WHERE deleted_at IS NULL AND created_at BETWEEN ${range.from} AND ${range.to} AND ${scope.opportunities}
      GROUP BY status
    `),
  );

  const prospectsBySource = rowsOf(
    await db.execute(sql`
      SELECT COALESCE(s.name, 'Sin fuente') AS "source", COUNT(p.id)::int AS "count"
      FROM prospects p
      LEFT JOIN prospect_sources s ON s.id = p.source_id
      WHERE p.deleted_at IS NULL AND p.entered_at BETWEEN ${range.from} AND ${range.to} AND ${scope.prospects}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `),
  );

  const activitiesByType = rowsOf(
    await db.execute(sql`
      SELECT at.name AS "type", at.color, COUNT(a.id)::int AS "count"
      FROM activity_types at
      LEFT JOIN activities a
        ON a.type_id = at.id AND a.deleted_at IS NULL
       AND a.scheduled_at BETWEEN ${range.from} AND ${range.to} AND ${scope.activities}
      WHERE at.is_active = TRUE
      GROUP BY at.id, at.name, at.color, at."order"
      ORDER BY at."order"
    `),
  );

  const topClients = rowsOf(
    await db.execute(sql`
      SELECT c.id, c.legal_name AS "clientName", COALESCE(SUM(s.total),0)::numeric(14,2) AS "total"
      FROM sales s
      INNER JOIN clients c ON c.id = s.client_id
      WHERE s.deleted_at IS NULL AND s.status <> 'ANULADA'
        AND s.sale_date BETWEEN ${range.from} AND ${range.to}
        AND ${scope.sales}
      GROUP BY c.id, c.legal_name
      ORDER BY 3 DESC LIMIT 8
    `),
  );

  ok(res, {
    salesTrend,
    pipelineByStage,
    opportunitiesOutcome,
    prospectsBySource,
    activitiesByType,
    topClients,
  });
}
