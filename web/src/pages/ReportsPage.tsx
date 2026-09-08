import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { apiDownload, apiGet, errorMessage } from '../lib/api';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';
import { downloadBlob } from '../lib/utils';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { StatCard } from '../components/ui/StatCard';
import { ErrorState, Spinner } from '../components/ui/Spinner';
import { PeriodFilter, type PeriodValue } from '../components/PeriodFilter';
import { ChartFrame, ChartTooltip } from '../components/charts/ChartFrame';
import { CATEGORICAL, CHART_TOKENS, SEQUENTIAL_HUE, shortDate } from '../lib/charts';
import { useUserOptions } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { FilterSelect } from '../components/ResourceToolbar';
import { Download } from 'lucide-react';

type ReportKey = 'ventas' | 'oportunidades' | 'clientes' | 'actividades';

const TABS = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'oportunidades', label: 'Oportunidades' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'actividades', label: 'Actividades' },
];

const ENDPOINTS: Record<ReportKey, string> = {
  ventas: '/reports/sales',
  oportunidades: '/reports/opportunities',
  clientes: '/reports/clients',
  actividades: '/reports/activities',
};

export default function ReportsPage() {
  const { can } = useAuth();
  const { data: users } = useUserOptions();
  const [report, setReport] = useState<ReportKey>('ventas');
  const [period, setPeriod] = useState<PeriodValue>({ period: 'anio' });
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const [downloading, setDownloading] = useState(false);

  const params = useMemo(
    () => ({ period: period.period, from: period.from || undefined, to: period.to || undefined, ownerId }),
    [period, ownerId],
  );

  const query = useQuery({
    queryKey: ['report', report, params],
    queryFn: () => apiGet<Record<string, never>>(ENDPOINTS[report], params),
  });

  const exportReport = async () => {
    setDownloading(true);
    try {
      const result = await apiDownload('/reports/export', { ...params, report, format: 'xlsx' }, `reporte-${report}.xlsx`);
      downloadBlob(result.blob, result.fileName);
      toast.success('Reporte exportado');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const data = query.data as Record<string, never> | undefined;

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Análisis del desempeño comercial por período."
        actions={
          <>
            <PeriodFilter value={period} onChange={setPeriod} />
            {can('reports.export') && (
              <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={downloading} onClick={() => void exportReport()}>
                Exportar Excel
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <Tabs items={TABS} active={report} onChange={(key) => setReport(key as ReportKey)} />
        <CardBody className="py-3">
          <FilterSelect
            label="Ejecutivo"
            value={ownerId}
            onChange={setOwnerId}
            options={(users ?? []).map((user) => ({ value: user.id, label: user.label }))}
          />
        </CardBody>
      </Card>

      {query.isLoading && (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      )}

      {!query.isLoading && data && report === 'ventas' && <SalesReport data={data as never} />}
      {!query.isLoading && data && report === 'oportunidades' && <OpportunitiesReport data={data as never} />}
      {!query.isLoading && data && report === 'clientes' && <ClientsReport data={data as never} />}
      {!query.isLoading && data && report === 'actividades' && <ActivitiesReport data={data as never} />}
    </>
  );
}

interface SalesData {
  totals: { count: number; total: string; average: string; pending: string };
  byPeriod: Array<{ period: string; count: number; total: string }>;
  bySeller: Array<{ seller: string; count: number; total: string }>;
  byClient: Array<{ client: string; count: number; total: string }>;
  byProduct: Array<{ product: string; quantity: string; total: string }>;
  wonLost: Array<{ status: string; count: number; total: string }>;
}

function SalesReport({ data }: { data: SalesData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ventas totales" value={formatMoney(data.totals?.total)} tone="success" />
        <StatCard label="Número de ventas" value={formatNumber(data.totals?.count)} tone="info" />
        <StatCard label="Ticket promedio" value={formatMoney(data.totals?.average)} tone="brand" />
        <StatCard label="Pendiente de cobro" value={formatMoney(data.totals?.pending)} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Ventas por mes" subtitle="Monto facturado" isEmpty={!data.byPeriod?.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.byPeriod} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tickFormatter={shortDate} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={{ stroke: CHART_TOKENS.grid }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={false} width={70} tickFormatter={(value: number) => formatMoney(value)} />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={shortDate(String(label))}
                      rows={[
                        { name: 'Total', value: formatMoney(payload[0]!.value as number), color: SEQUENTIAL_HUE },
                        { name: 'Ventas', value: formatNumber(payload[0]!.payload.count) },
                      ]}
                    />
                  ) : null
                }
              />
              <Line type="monotone" dataKey="total" stroke={SEQUENTIAL_HUE} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Ventas por vendedor" subtitle="Monto acumulado en el período" isEmpty={!data.bySeller?.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={data.bySeller} margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="seller" width={120} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.seller)}
                      rows={[
                        { name: 'Total', value: formatMoney(payload[0]!.payload.total), color: SEQUENTIAL_HUE },
                        { name: 'Ventas', value: formatNumber(payload[0]!.payload.count) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="total" fill={SEQUENTIAL_HUE} radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList dataKey="total" position="right" formatter={(value: unknown) => formatMoney(value as number)} style={{ fontSize: 10, fill: CHART_TOKENS.textSecondary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TableCard
          title="Ventas por cliente"
          columns={['Cliente', 'Ventas', 'Total']}
          rows={(data.byClient ?? []).map((row) => [row.client, formatNumber(row.count), formatMoney(row.total)])}
        />
        <TableCard
          title="Ventas por producto"
          columns={['Producto', 'Cantidad', 'Total']}
          rows={(data.byProduct ?? []).map((row) => [row.product, formatNumber(row.quantity, 2), formatMoney(row.total)])}
        />
      </div>

      <TableCard
        title="Oportunidades ganadas y perdidas en el período"
        columns={['Resultado', 'Cantidad', 'Valor']}
        rows={(data.wonLost ?? []).map((row) => [row.status, formatNumber(row.count), formatMoney(row.total)])}
      />
    </div>
  );
}

interface OpportunitiesData {
  byStage: Array<{ stage: string; count: number; total: string; weighted: string }>;
  byOwner: Array<{ owner: string; open: number; won: number; lost: number; wonValue: string }>;
  outcome: Array<{ status: string; count: number; total: string }>;
  conversion: { total: number; won: number; lost: number; winRate: string; avgDaysToWin: string };
  bySource: Array<{ source: string; count: number; total: string }>;
}

function OpportunitiesReport({ data }: { data: OpportunitiesData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Oportunidades" value={formatNumber(data.conversion?.total)} tone="info" />
        <StatCard label="Ganadas" value={formatNumber(data.conversion?.won)} tone="success" />
        <StatCard label="Tasa de conversión" value={formatPercent(data.conversion?.winRate)} tone="brand" />
        <StatCard label="Días promedio al cierre" value={formatNumber(data.conversion?.avgDaysToWin, 1)} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Valor del pipeline por etapa" subtitle="Oportunidades abiertas" isEmpty={!data.byStage?.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={data.byStage} margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="stage" width={110} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.stage)}
                      rows={[
                        { name: 'Valor', value: formatMoney(payload[0]!.payload.total), color: SEQUENTIAL_HUE },
                        { name: 'Ponderado', value: formatMoney(payload[0]!.payload.weighted) },
                        { name: 'Cantidad', value: formatNumber(payload[0]!.payload.count) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="total" fill={SEQUENTIAL_HUE} radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList dataKey="total" position="right" formatter={(value: unknown) => formatMoney(value as number)} style={{ fontSize: 10, fill: CHART_TOKENS.textSecondary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Resultado de oportunidades" subtitle="Creadas en el período" isEmpty={!data.outcome?.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.outcome} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={{ stroke: CHART_TOKENS.grid }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.status)}
                      rows={[
                        { name: 'Cantidad', value: formatNumber(payload[0]!.payload.count) },
                        { name: 'Valor', value: formatMoney(payload[0]!.payload.total) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={54}>
                {(data.outcome ?? []).map((row, index) => (
                  <Cell key={row.status} fill={CATEGORICAL[index % CATEGORICAL.length]} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TableCard
          title="Desempeño por ejecutivo"
          columns={['Ejecutivo', 'Abiertas', 'Ganadas', 'Perdidas', 'Valor ganado']}
          rows={(data.byOwner ?? []).map((row) => [
            row.owner,
            formatNumber(row.open),
            formatNumber(row.won),
            formatNumber(row.lost),
            formatMoney(row.wonValue),
          ])}
        />
        <TableCard
          title="Oportunidades por fuente"
          columns={['Fuente', 'Cantidad', 'Valor']}
          rows={(data.bySource ?? []).map((row) => [row.source, formatNumber(row.count), formatMoney(row.total)])}
        />
      </div>
    </div>
  );
}

interface ClientsData {
  byStatus: Array<{ status: string; count: number }>;
  newByMonth: Array<{ period: string; count: number }>;
  byOwner: Array<{ owner: string; count: number }>;
  bySector: Array<{ sector: string; count: number }>;
  topByRevenue: Array<{ client: string; revenue: string; sales: number }>;
}

function ClientsReport({ data }: { data: ClientsData }) {
  const total = (data.byStatus ?? []).reduce((acc, row) => acc + row.count, 0);
  const active = (data.byStatus ?? []).find((row) => row.status === 'ACTIVO')?.count ?? 0;
  const inactive = (data.byStatus ?? []).find((row) => row.status === 'INACTIVO')?.count ?? 0;
  const newClients = (data.newByMonth ?? []).reduce((acc, row) => acc + row.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total de clientes" value={formatNumber(total)} tone="brand" />
        <StatCard label="Activos" value={formatNumber(active)} tone="success" />
        <StatCard label="Inactivos" value={formatNumber(inactive)} tone="neutral" />
        <StatCard label="Nuevos en el período" value={formatNumber(newClients)} tone="info" />
      </div>

      <ChartFrame title="Clientes nuevos por mes" subtitle="Altas registradas" isEmpty={!data.newByMonth?.length}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.newByMonth} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" tickFormatter={shortDate} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={{ stroke: CHART_TOKENS.grid }} />
            <YAxis tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.12)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip title={shortDate(String(label))} rows={[{ name: 'Clientes nuevos', value: formatNumber(payload[0]!.value as number), color: SEQUENTIAL_HUE }]} />
                ) : null
              }
            />
            <Bar dataKey="count" fill={SEQUENTIAL_HUE} radius={[4, 4, 0, 0]} maxBarSize={40}>
              <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TableCard title="Cartera por ejecutivo" columns={['Ejecutivo', 'Clientes']} rows={(data.byOwner ?? []).map((r) => [r.owner, formatNumber(r.count)])} />
        <TableCard title="Clientes por sector" columns={['Sector', 'Clientes']} rows={(data.bySector ?? []).map((r) => [r.sector, formatNumber(r.count)])} />
        <TableCard
          title="Clientes con mayor facturación"
          columns={['Cliente', 'Ventas', 'Facturado']}
          rows={(data.topByRevenue ?? []).map((r) => [r.client, formatNumber(r.sales), formatMoney(r.revenue)])}
        />
      </div>
    </div>
  );
}

interface ActivitiesData {
  byUser: Array<{ user: string; total: number; completed: number; pending: number }>;
  byType: Array<{ type: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  tasksByUser: Array<{ user: string; total: number; completed: number; overdue: number }>;
}

function ActivitiesReport({ data }: { data: ActivitiesData }) {
  const total = (data.byStatus ?? []).reduce((acc, row) => acc + row.count, 0);
  const completed = (data.byStatus ?? []).find((row) => row.status === 'COMPLETADA')?.count ?? 0;
  const pending = (data.byStatus ?? []).find((row) => row.status === 'PENDIENTE')?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Actividades" value={formatNumber(total)} tone="brand" />
        <StatCard label="Completadas" value={formatNumber(completed)} tone="success" />
        <StatCard label="Pendientes" value={formatNumber(pending)} tone="warning" />
        <StatCard
          label="Cumplimiento"
          value={formatPercent(total > 0 ? (completed / total) * 100 : 0)}
          tone="info"
        />
      </div>

      <ChartFrame title="Actividades por tipo" subtitle="Interacciones registradas" isEmpty={!data.byType?.length}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data.byType} margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="type" width={110} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.12)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip title={String(payload[0]!.payload.type)} rows={[{ name: 'Actividades', value: formatNumber(payload[0]!.payload.count), color: SEQUENTIAL_HUE }]} />
                ) : null
              }
            />
            <Bar dataKey="count" fill={SEQUENTIAL_HUE} radius={[0, 4, 4, 0]} maxBarSize={18}>
              <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: CHART_TOKENS.textSecondary }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TableCard
          title="Actividades por usuario"
          columns={['Usuario', 'Total', 'Completadas', 'Pendientes']}
          rows={(data.byUser ?? []).map((r) => [r.user, formatNumber(r.total), formatNumber(r.completed), formatNumber(r.pending)])}
        />
        <TableCard
          title="Tareas por usuario"
          columns={['Usuario', 'Total', 'Completadas', 'Vencidas']}
          rows={(data.tasksByUser ?? []).map((r) => [r.user, formatNumber(r.total), formatNumber(r.completed), formatNumber(r.overdue)])}
        />
      </div>
    </div>
  );
}

/** Tabla simple usada como vista alternativa a los gráficos (accesibilidad). */
function TableCard({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                {columns.map((column, index) => (
                  <th key={column} className={index === 0 ? 'px-4 py-2.5 text-left' : 'px-4 py-2.5 text-right'}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                    Sin datos en el período seleccionado.
                  </td>
                </tr>
              )}
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cellIndex === 0 ? 'px-4 py-2.5 text-slate-800' : 'px-4 py-2.5 text-right text-slate-700'}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
