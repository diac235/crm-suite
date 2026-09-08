import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckSquare,
  FileText,
  Receipt,
  Target,
  UserPlus,
} from 'lucide-react';
import { apiGet, errorMessage } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber, formatRelative } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { ErrorState, FullPageSpinner } from '../components/ui/Spinner';
import { PeriodFilter, type PeriodValue } from '../components/PeriodFilter';
import { ChartFrame, ChartTooltip } from '../components/charts/ChartFrame';
import { CATEGORICAL, CHART_TOKENS, SEQUENTIAL_HUE, shortDate } from '../lib/charts';

interface Kpis {
  clientsTotal: string;
  clientsNew: string;
  clientsNewPrev: string;
  clientsActive: string;
  clientsInactive: string;
  prospectsOpen: string;
  prospectsNew: string;
  prospectsNewPrev: string;
  prospectsConverted: string;
  opportunitiesOpen: string;
  pipelineValue: string;
  pipelineWeighted: string;
  opportunitiesWon: string;
  opportunitiesWonValue: string;
  opportunitiesLost: string;
  quotesSent: string;
  quotesAccepted: string;
  quotesRejected: string;
  quotesExpiringSoon: string;
  salesTotal: string;
  salesTotalPrev: string;
  salesCount: string;
  salesPending: string;
  activitiesPending: string;
  activitiesCompleted: string;
  tasksOverdue: string;
  tasksPending: string;
  followUpsPending: string;
}

interface Summary {
  range: { from: string; to: string; period: string };
  kpis: Kpis;
  upcomingMeetings: Array<{
    id: string;
    subject: string;
    scheduledAt: string;
    typeName: string;
    clientName: string | null;
  }>;
  overdueTasks: Array<{ id: string; title: string; dueAt: string; priority: string; clientName: string | null }>;
  pendingFollowUps: Array<{
    id: string;
    code: string;
    firstName: string;
    lastName: string | null;
    companyName: string | null;
    nextFollowUpAt: string;
    temperature: string;
  }>;
}

interface Charts {
  salesTrend: Array<{ date: string; total: string; count: number }>;
  pipelineByStage: Array<{ stage: string; color: string; count: number; total: string }>;
  opportunitiesOutcome: Array<{ status: string; count: number; total: string }>;
  prospectsBySource: Array<{ source: string; count: number }>;
  activitiesByType: Array<{ type: string; color: string; count: number }>;
  topClients: Array<{ id: string; clientName: string; total: string }>;
}

function delta(current: string, previous: string): number | null {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return ((now - before) / before) * 100;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodValue>({ period: 'mes' });

  const params = useMemo(
    () => ({ period: period.period, from: period.from || undefined, to: period.to || undefined }),
    [period],
  );

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary', params],
    queryFn: () => apiGet<Summary>('/dashboard/summary', params),
  });

  const chartsQuery = useQuery({
    queryKey: ['dashboard', 'charts', params],
    queryFn: () => apiGet<Charts>('/dashboard/charts', params),
  });

  if (summaryQuery.isLoading) return <FullPageSpinner message="Cargando indicadores…" />;
  if (summaryQuery.isError) {
    return <ErrorState message={errorMessage(summaryQuery.error)} onRetry={() => summaryQuery.refetch()} />;
  }

  const kpis = summaryQuery.data!.kpis;
  const charts = chartsQuery.data;

  const outcomeData = (charts?.opportunitiesOutcome ?? []).map((row) => ({
    ...row,
    label: row.status === 'ABIERTA' ? 'Abiertas' : row.status === 'GANADA' ? 'Ganadas' : row.status === 'PERDIDA' ? 'Perdidas' : 'Canceladas',
  }));

  return (
    <>
      <PageHeader
        title="Dashboard comercial"
        description="Resumen del desempeño en el período seleccionado."
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {/* --- Indicadores principales ------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventas del período"
          value={formatMoney(kpis.salesTotal)}
          hint={`${formatNumber(kpis.salesCount)} ventas`}
          delta={delta(kpis.salesTotal, kpis.salesTotalPrev)}
          icon={<Receipt size={20} />}
          tone="success"
          onClick={() => navigate('/ventas')}
        />
        <StatCard
          label="Pipeline abierto"
          value={formatMoney(kpis.pipelineValue)}
          hint={`Ponderado ${formatMoney(kpis.pipelineWeighted)}`}
          icon={<Target size={20} />}
          tone="brand"
          onClick={() => navigate('/oportunidades')}
        />
        <StatCard
          label="Clientes"
          value={formatNumber(kpis.clientsTotal)}
          hint={`${formatNumber(kpis.clientsNew)} nuevos en el período`}
          delta={delta(kpis.clientsNew, kpis.clientsNewPrev)}
          icon={<Building2 size={20} />}
          tone="info"
          onClick={() => navigate('/clientes')}
        />
        <StatCard
          label="Prospectos activos"
          value={formatNumber(kpis.prospectsOpen)}
          hint={`${formatNumber(kpis.prospectsNew)} nuevos · ${formatNumber(kpis.prospectsConverted)} convertidos`}
          delta={delta(kpis.prospectsNew, kpis.prospectsNewPrev)}
          icon={<UserPlus size={20} />}
          tone="warning"
          onClick={() => navigate('/prospectos')}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Oport. abiertas" value={formatNumber(kpis.opportunitiesOpen)} tone="info" />
        <StatCard label="Oport. ganadas" value={formatNumber(kpis.opportunitiesWon)} hint={formatMoney(kpis.opportunitiesWonValue)} tone="success" />
        <StatCard label="Oport. perdidas" value={formatNumber(kpis.opportunitiesLost)} tone="danger" />
        <StatCard label="Cotiz. enviadas" value={formatNumber(kpis.quotesSent)} icon={<FileText size={20} />} tone="info" />
        <StatCard label="Cotiz. aceptadas" value={formatNumber(kpis.quotesAccepted)} tone="success" />
        <StatCard label="Cotiz. rechazadas" value={formatNumber(kpis.quotesRejected)} tone="danger" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Ventas pendientes" value={formatMoney(kpis.salesPending)} tone="warning" />
        <StatCard label="Actividades pendientes" value={formatNumber(kpis.activitiesPending)} tone="info" onClick={() => navigate('/actividades')} />
        <StatCard label="Actividades completadas" value={formatNumber(kpis.activitiesCompleted)} tone="success" />
        <StatCard label="Tareas pendientes" value={formatNumber(kpis.tasksPending)} icon={<CheckSquare size={20} />} tone="info" onClick={() => navigate('/tareas')} />
        <StatCard label="Tareas vencidas" value={formatNumber(kpis.tasksOverdue)} icon={<AlertTriangle size={20} />} tone="danger" onClick={() => navigate('/tareas')} />
        <StatCard label="Seguimientos pendientes" value={formatNumber(kpis.followUpsPending)} tone="warning" onClick={() => navigate('/prospectos')} />
      </div>

      {/* --- Gráficos ------------------------------------------------------ */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Ventas facturadas por día"
          subtitle="Monto total registrado en el período"
          className="xl:col-span-2"
          isEmpty={!charts?.salesTrend.length}
          height={280}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts?.salesTrend ?? []} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SEQUENTIAL_HUE} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={SEQUENTIAL_HUE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }}
                axisLine={{ stroke: CHART_TOKENS.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }}
                axisLine={false}
                tickLine={false}
                width={70}
                tickFormatter={(value: number) => formatMoney(value)}
              />
              <Tooltip
                cursor={{ stroke: CHART_TOKENS.axis, strokeDasharray: '3 3' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={shortDate(String(label))}
                      rows={[
                        { name: 'Ventas', value: formatMoney(payload[0]!.value as number), color: SEQUENTIAL_HUE },
                        { name: 'Documentos', value: formatNumber(payload[0]!.payload.count) },
                      ]}
                    />
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={SEQUENTIAL_HUE}
                strokeWidth={2}
                fill="url(#salesGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Resultado de oportunidades"
          subtitle="Oportunidades creadas en el período"
          isEmpty={outcomeData.length === 0}
          height={280}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={outcomeData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} axisLine={{ stroke: CHART_TOKENS.grid }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.label)}
                      rows={[
                        { name: 'Cantidad', value: formatNumber(payload[0]!.payload.count) },
                        { name: 'Valor', value: formatMoney(payload[0]!.payload.total) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={54}>
                {outcomeData.map((row, index) => (
                  <Cell key={row.status} fill={CATEGORICAL[index % CATEGORICAL.length]} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartFrame title="Pipeline por etapa" subtitle="Valor de oportunidades abiertas" isEmpty={!charts?.pipelineByStage.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={charts?.pipelineByStage ?? []}
              margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stage"
                width={96}
                tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.stage)}
                      rows={[
                        { name: 'Valor', value: formatMoney(payload[0]!.payload.total), color: SEQUENTIAL_HUE },
                        { name: 'Oportunidades', value: formatNumber(payload[0]!.payload.count) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="total" fill={SEQUENTIAL_HUE} radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList
                  dataKey="total"
                  position="right"
                  formatter={(value: unknown) => formatMoney(value as number)}
                  style={{ fontSize: 10, fill: CHART_TOKENS.textSecondary }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Prospectos por fuente" subtitle="Origen de los prospectos ingresados" isEmpty={!charts?.prospectsBySource.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={charts?.prospectsBySource ?? []} margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="source" width={110} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.source)}
                      rows={[{ name: 'Prospectos', value: formatNumber(payload[0]!.payload.count), color: SEQUENTIAL_HUE }]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="count" fill={SEQUENTIAL_HUE} radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: CHART_TOKENS.textSecondary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Actividades por tipo" subtitle="Interacciones registradas en el período" isEmpty={!charts?.activitiesByType.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={charts?.activitiesByType ?? []} margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="type" width={96} tick={{ fontSize: 11, fill: CHART_TOKENS.textSecondary }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(payload[0]!.payload.type)}
                      rows={[{ name: 'Actividades', value: formatNumber(payload[0]!.payload.count), color: SEQUENTIAL_HUE }]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="count" fill={SEQUENTIAL_HUE} radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: CHART_TOKENS.textSecondary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      {/* --- Listas de trabajo -------------------------------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Próximas reuniones y actividades" />
          <CardBody className="p-0">
            {summaryQuery.data!.upcomingMeetings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No hay actividades programadas.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summaryQuery.data!.upcomingMeetings.map((meeting) => (
                  <li key={meeting.id} className="flex items-start gap-3 px-5 py-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{meeting.subject}</p>
                      <p className="truncate text-xs text-slate-500">
                        {meeting.typeName}
                        {meeting.clientName ? ` · ${meeting.clientName}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDateTime(meeting.scheduledAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tareas vencidas" />
          <CardBody className="p-0">
            {summaryQuery.data!.overdueTasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No tiene tareas vencidas. </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summaryQuery.data!.overdueTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-3 px-5 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                      <p className="truncate text-xs text-slate-500">{task.clientName ?? 'Sin cliente'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge value={task.priority} />
                      <p className="mt-0.5 text-[11px] text-red-500">{formatRelative(task.dueAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Seguimientos pendientes" />
          <CardBody className="p-0">
            {summaryQuery.data!.pendingFollowUps.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Sin seguimientos próximos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summaryQuery.data!.pendingFollowUps.map((prospect) => (
                  <li key={prospect.id} className="flex items-start gap-3 px-5 py-3">
                    <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {prospect.companyName ?? `${prospect.firstName} ${prospect.lastName ?? ''}`}
                      </p>
                      <p className="truncate text-xs text-slate-500">{prospect.code}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge value={prospect.temperature} />
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatRelative(prospect.nextFollowUpAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
