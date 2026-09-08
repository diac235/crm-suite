import type { Request, Response } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ok } from '../../core/http';
import { periodSchema, resolveRange, type PeriodQuery } from '../../core/dates';
import { sendExport } from '../../services/export.service';
import { recordAudit } from '../../services/audit.service';

export const reportQuerySchema = periodSchema.extend({
  ownerId: z.string().uuid().optional(),
});

export const reportExportSchema = reportQuerySchema.extend({
  report: z.enum(['ventas', 'oportunidades', 'clientes', 'actividades']),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
});

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownerFilter(column: string, ownerId?: string) {
  if (!ownerId || !UUID_PATTERN.test(ownerId)) return sql.raw('TRUE');
  return sql.raw(`${column} = '${ownerId}'`);
}

/** Reporte de ventas: por período, vendedor, cliente y producto. */
export async function salesReport(req: Request, res: Response) {
  const query = req.query as unknown as z.infer<typeof reportQuerySchema>;
  const range = resolveRange(query as PeriodQuery);
  const owner = ownerFilter('s.owner_id', query.ownerId);

  const [byPeriod, bySeller, byClient, byProduct, wonLost, totals] = await Promise.all([
    db.execute(sql`
      SELECT to_char(date_trunc('month', s.sale_date), 'YYYY-MM') AS "period",
             COUNT(*)::int AS "count",
             COALESCE(SUM(s.total),0)::numeric(14,2) AS "total"
      FROM sales s
      WHERE s.deleted_at IS NULL AND s.status <> 'ANULADA'
        AND s.sale_date BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "seller",
             COUNT(*)::int AS "count",
             COALESCE(SUM(s.total),0)::numeric(14,2) AS "total"
      FROM sales s
      LEFT JOIN users u ON u.id = s.owner_id
      WHERE s.deleted_at IS NULL AND s.status <> 'ANULADA'
        AND s.sale_date BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 3 DESC
    `),
    db.execute(sql`
      SELECT c.legal_name AS "client", COUNT(*)::int AS "count",
             COALESCE(SUM(s.total),0)::numeric(14,2) AS "total"
      FROM sales s
      INNER JOIN clients c ON c.id = s.client_id
      WHERE s.deleted_at IS NULL AND s.status <> 'ANULADA'
        AND s.sale_date BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 3 DESC LIMIT 25
    `),
    db.execute(sql`
      SELECT COALESCE(p.name, si.description) AS "product",
             SUM(si.quantity)::numeric(14,2) AS "quantity",
             COALESCE(SUM(si.line_total),0)::numeric(14,2) AS "total"
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.deleted_at IS NULL AND s.status <> 'ANULADA'
        AND s.sale_date BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 3 DESC LIMIT 25
    `),
    db.execute(sql`
      SELECT o.status,
             COUNT(*)::int AS "count",
             COALESCE(SUM(o.amount),0)::numeric(14,2) AS "total"
      FROM opportunities o
      WHERE o.deleted_at IS NULL AND o.status IN ('GANADA','PERDIDA')
        AND o.closed_at BETWEEN ${range.from} AND ${range.to}
        AND ${ownerFilter('o.owner_id', query.ownerId)}
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS "count",
             COALESCE(SUM(s.total),0)::numeric(14,2) AS "total",
             COALESCE(AVG(s.total),0)::numeric(14,2) AS "average",
             COALESCE(SUM(s.total) FILTER (WHERE s.status = 'PENDIENTE'),0)::numeric(14,2) AS "pending"
      FROM sales s
      WHERE s.deleted_at IS NULL AND s.status <> 'ANULADA'
        AND s.sale_date BETWEEN ${range.from} AND ${range.to} AND ${owner}
    `),
  ]);

  ok(res, {
    range,
    totals: rowsOf(totals)[0],
    byPeriod: rowsOf(byPeriod),
    bySeller: rowsOf(bySeller),
    byClient: rowsOf(byClient),
    byProduct: rowsOf(byProduct),
    wonLost: rowsOf(wonLost),
  });
}

/** Reporte de oportunidades: pipeline, conversión y resultados. */
export async function opportunitiesReport(req: Request, res: Response) {
  const query = req.query as unknown as z.infer<typeof reportQuerySchema>;
  const range = resolveRange(query as PeriodQuery);
  const owner = ownerFilter('o.owner_id', query.ownerId);

  const [byStage, byOwner, outcome, conversion, bySource] = await Promise.all([
    db.execute(sql`
      SELECT ps.name AS "stage", ps.color, ps."order",
             COUNT(o.id)::int AS "count",
             COALESCE(SUM(o.amount),0)::numeric(14,2) AS "total",
             COALESCE(SUM(o.amount * o.probability / 100.0),0)::numeric(14,2) AS "weighted"
      FROM pipeline_stages ps
      LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.deleted_at IS NULL AND o.status = 'ABIERTA' AND ${owner}
      WHERE ps.is_active = TRUE
      GROUP BY ps.id, ps.name, ps.color, ps."order" ORDER BY ps."order"
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "owner",
             COUNT(*) FILTER (WHERE o.status = 'ABIERTA')::int AS "open",
             COUNT(*) FILTER (WHERE o.status = 'GANADA')::int AS "won",
             COUNT(*) FILTER (WHERE o.status = 'PERDIDA')::int AS "lost",
             COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'GANADA'),0)::numeric(14,2) AS "wonValue"
      FROM opportunities o
      LEFT JOIN users u ON u.id = o.owner_id
      WHERE o.deleted_at IS NULL AND o.created_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 5 DESC
    `),
    db.execute(sql`
      SELECT o.status, COUNT(*)::int AS "count", COALESCE(SUM(o.amount),0)::numeric(14,2) AS "total"
      FROM opportunities o
      WHERE o.deleted_at IS NULL AND o.created_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE o.status = 'GANADA')::int AS "won",
        COUNT(*) FILTER (WHERE o.status = 'PERDIDA')::int AS "lost",
        CASE WHEN COUNT(*) FILTER (WHERE o.status IN ('GANADA','PERDIDA')) = 0 THEN 0
             ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'GANADA')
                  / COUNT(*) FILTER (WHERE o.status IN ('GANADA','PERDIDA')), 2)
        END AS "winRate",
        COALESCE(AVG(EXTRACT(EPOCH FROM (o.closed_at - o.opened_at)) / 86400)
                 FILTER (WHERE o.status = 'GANADA'), 0)::numeric(10,1) AS "avgDaysToWin"
      FROM opportunities o
      WHERE o.deleted_at IS NULL AND o.created_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
    `),
    db.execute(sql`
      SELECT COALESCE(src.name, 'Sin fuente') AS "source",
             COUNT(*)::int AS "count",
             COALESCE(SUM(o.amount),0)::numeric(14,2) AS "total"
      FROM opportunities o
      LEFT JOIN prospect_sources src ON src.id = o.source_id
      WHERE o.deleted_at IS NULL AND o.created_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 3 DESC
    `),
  ]);

  ok(res, {
    range,
    byStage: rowsOf(byStage),
    byOwner: rowsOf(byOwner),
    outcome: rowsOf(outcome),
    conversion: rowsOf(conversion)[0],
    bySource: rowsOf(bySource),
  });
}

/** Reporte de clientes: altas, estado y cartera por ejecutivo. */
export async function clientsReport(req: Request, res: Response) {
  const query = req.query as unknown as z.infer<typeof reportQuerySchema>;
  const range = resolveRange(query as PeriodQuery);
  const owner = ownerFilter('c.owner_id', query.ownerId);

  const [byStatus, newByMonth, byOwner, bySector, topByRevenue] = await Promise.all([
    db.execute(sql`
      SELECT c.status, COUNT(*)::int AS "count"
      FROM clients c WHERE c.deleted_at IS NULL AND ${owner} GROUP BY 1
    `),
    db.execute(sql`
      SELECT to_char(date_trunc('month', c.created_at), 'YYYY-MM') AS "period", COUNT(*)::int AS "count"
      FROM clients c
      WHERE c.deleted_at IS NULL AND c.created_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "owner",
             COUNT(*)::int AS "count"
      FROM clients c LEFT JOIN users u ON u.id = c.owner_id
      WHERE c.deleted_at IS NULL AND ${owner} GROUP BY 1 ORDER BY 2 DESC
    `),
    db.execute(sql`
      SELECT COALESCE(s.name, 'Sin sector') AS "sector", COUNT(*)::int AS "count"
      FROM clients c LEFT JOIN sectors s ON s.id = c.sector_id
      WHERE c.deleted_at IS NULL AND ${owner} GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `),
    db.execute(sql`
      SELECT c.legal_name AS "client",
             COALESCE(SUM(sa.total),0)::numeric(14,2) AS "revenue",
             COUNT(sa.id)::int AS "sales"
      FROM clients c
      LEFT JOIN sales sa ON sa.client_id = c.id AND sa.deleted_at IS NULL AND sa.status <> 'ANULADA'
      WHERE c.deleted_at IS NULL AND ${owner}
      GROUP BY c.id, c.legal_name ORDER BY 2 DESC LIMIT 20
    `),
  ]);

  ok(res, {
    range,
    byStatus: rowsOf(byStatus),
    newByMonth: rowsOf(newByMonth),
    byOwner: rowsOf(byOwner),
    bySector: rowsOf(bySector),
    topByRevenue: rowsOf(topByRevenue),
  });
}

/** Reporte de actividades: carga de trabajo y cumplimiento. */
export async function activitiesReport(req: Request, res: Response) {
  const query = req.query as unknown as z.infer<typeof reportQuerySchema>;
  const range = resolveRange(query as PeriodQuery);
  const owner = ownerFilter('a.owner_id', query.ownerId);

  const [byUser, byType, byStatus, tasksByUser] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "user",
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE a.status = 'COMPLETADA')::int AS "completed",
             COUNT(*) FILTER (WHERE a.status IN ('PENDIENTE','EN_PROGRESO'))::int AS "pending"
      FROM activities a LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.deleted_at IS NULL AND a.scheduled_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1 ORDER BY 2 DESC
    `),
    db.execute(sql`
      SELECT at.name AS "type", at.color, COUNT(a.id)::int AS "count"
      FROM activity_types at
      LEFT JOIN activities a ON a.type_id = at.id AND a.deleted_at IS NULL
        AND a.scheduled_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      WHERE at.is_active = TRUE GROUP BY at.id, at.name, at.color, at."order" ORDER BY at."order"
    `),
    db.execute(sql`
      SELECT a.status, COUNT(*)::int AS "count"
      FROM activities a
      WHERE a.deleted_at IS NULL AND a.scheduled_at BETWEEN ${range.from} AND ${range.to} AND ${owner}
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "user",
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE t.status = 'COMPLETADA')::int AS "completed",
             COUNT(*) FILTER (WHERE t.status IN ('PENDIENTE','EN_PROGRESO') AND t.due_at < NOW())::int AS "overdue"
      FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.deleted_at IS NULL AND t.created_at BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1 ORDER BY 2 DESC
    `),
  ]);

  ok(res, {
    range,
    byUser: rowsOf(byUser),
    byType: rowsOf(byType),
    byStatus: rowsOf(byStatus),
    tasksByUser: rowsOf(tasksByUser),
  });
}

/** Exportación tabular de cualquiera de los reportes anteriores. */
export async function exportReport(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as z.infer<typeof reportExportSchema>;
  const range = resolveRange(query as PeriodQuery);

  const configs: Record<
    string,
    { sql: ReturnType<typeof sql>; columns: Array<{ header: string; key: string; width?: number }>; sheet: string }
  > = {
    ventas: {
      sheet: 'Ventas',
      sql: sql`
        SELECT s.number AS "numero", c.legal_name AS "cliente",
               COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "vendedor",
               s.status AS "estado", s.sale_date AS "fecha",
               s.subtotal AS "subtotal", s.tax_total AS "impuestos", s.total AS "total"
        FROM sales s
        INNER JOIN clients c ON c.id = s.client_id
        LEFT JOIN users u ON u.id = s.owner_id
        WHERE s.deleted_at IS NULL AND s.sale_date BETWEEN ${range.from} AND ${range.to}
        ORDER BY s.sale_date DESC LIMIT 10000
      `,
      columns: [
        { header: 'Número', key: 'numero', width: 20 },
        { header: 'Cliente', key: 'cliente', width: 38 },
        { header: 'Vendedor', key: 'vendedor', width: 26 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 22 },
        { header: 'Subtotal', key: 'subtotal', width: 14 },
        { header: 'Impuestos', key: 'impuestos', width: 14 },
        { header: 'Total', key: 'total', width: 16 },
      ],
    },
    oportunidades: {
      sheet: 'Oportunidades',
      sql: sql`
        SELECT o.code AS "codigo", o.name AS "nombre", c.legal_name AS "cliente",
               ps.name AS "etapa", o.status AS "estado", o.amount AS "valor", o.probability AS "probabilidad",
               COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "responsable",
               o.opened_at AS "apertura", o.expected_close_at AS "cierreEstimado", o.closed_at AS "cierreReal"
        FROM opportunities o
        LEFT JOIN clients c ON c.id = o.client_id
        INNER JOIN pipeline_stages ps ON ps.id = o.stage_id
        LEFT JOIN users u ON u.id = o.owner_id
        WHERE o.deleted_at IS NULL AND o.created_at BETWEEN ${range.from} AND ${range.to}
        ORDER BY o.created_at DESC LIMIT 10000
      `,
      columns: [
        { header: 'Código', key: 'codigo', width: 14 },
        { header: 'Nombre', key: 'nombre', width: 40 },
        { header: 'Cliente', key: 'cliente', width: 36 },
        { header: 'Etapa', key: 'etapa', width: 18 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Valor', key: 'valor', width: 16 },
        { header: 'Probabilidad', key: 'probabilidad', width: 14 },
        { header: 'Responsable', key: 'responsable', width: 26 },
        { header: 'Apertura', key: 'apertura', width: 20 },
        { header: 'Cierre estimado', key: 'cierreEstimado', width: 20 },
        { header: 'Cierre real', key: 'cierreReal', width: 20 },
      ],
    },
    clientes: {
      sheet: 'Clientes',
      sql: sql`
        SELECT c.code AS "codigo", c.legal_name AS "razonSocial", c.trade_name AS "nombreComercial",
               c.tax_id AS "identificacion", c.status AS "estado", c.city AS "ciudad",
               COALESCE(s.name,'') AS "sector",
               COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "ejecutivo",
               c.created_at AS "creado",
               COALESCE((SELECT SUM(total) FROM sales sa WHERE sa.client_id = c.id AND sa.deleted_at IS NULL AND sa.status <> 'ANULADA'),0) AS "facturacion"
        FROM clients c
        LEFT JOIN sectors s ON s.id = c.sector_id
        LEFT JOIN users u ON u.id = c.owner_id
        WHERE c.deleted_at IS NULL
        ORDER BY c.legal_name LIMIT 10000
      `,
      columns: [
        { header: 'Código', key: 'codigo', width: 14 },
        { header: 'Razón social', key: 'razonSocial', width: 38 },
        { header: 'Nombre comercial', key: 'nombreComercial', width: 28 },
        { header: 'Identificación', key: 'identificacion', width: 18 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Ciudad', key: 'ciudad', width: 18 },
        { header: 'Sector', key: 'sector', width: 20 },
        { header: 'Ejecutivo', key: 'ejecutivo', width: 26 },
        { header: 'Creado', key: 'creado', width: 20 },
        { header: 'Facturación', key: 'facturacion', width: 16 },
      ],
    },
    actividades: {
      sheet: 'Actividades',
      sql: sql`
        SELECT at.name AS "tipo", a.subject AS "asunto", c.legal_name AS "cliente",
               COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), 'Sin asignar') AS "responsable",
               a.status AS "estado", a.scheduled_at AS "fecha", a.duration_min AS "duracion", a.outcome AS "resultado"
        FROM activities a
        INNER JOIN activity_types at ON at.id = a.type_id
        LEFT JOIN clients c ON c.id = a.client_id
        LEFT JOIN users u ON u.id = a.owner_id
        WHERE a.deleted_at IS NULL AND a.scheduled_at BETWEEN ${range.from} AND ${range.to}
        ORDER BY a.scheduled_at DESC LIMIT 10000
      `,
      columns: [
        { header: 'Tipo', key: 'tipo', width: 18 },
        { header: 'Asunto', key: 'asunto', width: 40 },
        { header: 'Cliente', key: 'cliente', width: 34 },
        { header: 'Responsable', key: 'responsable', width: 26 },
        { header: 'Estado', key: 'estado', width: 16 },
        { header: 'Fecha', key: 'fecha', width: 22 },
        { header: 'Duración (min)', key: 'duracion', width: 15 },
        { header: 'Resultado', key: 'resultado', width: 40 },
      ],
    },
  };

  const config = configs[query.report]!;
  const rows = rowsOf<Record<string, unknown>>(await db.execute(config.sql));

  await recordAudit({
    req, action: 'EXPORT', entityType: 'SETTING', module: 'reports',
    after: { reporte: query.report, registros: rows.length },
  });

  await sendExport(res, query.format, `reporte-${query.report}`, config.sheet, config.columns, rows);
}
