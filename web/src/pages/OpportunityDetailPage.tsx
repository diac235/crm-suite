import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, FileText, History, Pencil } from 'lucide-react';
import { apiGet, apiList, errorMessage } from '../lib/api';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { DataTable, type Column } from '../components/ui/DataTable';
import { ErrorState, FullPageSpinner } from '../components/ui/Spinner';
import { OpportunityFormModal } from '../features/opportunities/OpportunityFormModal';
import { MoveStageModal } from '../features/opportunities/MoveStageModal';
import { NotesPanel } from '../features/notes/NotesPanel';
import { DocumentsPanel } from '../features/documents/DocumentsPanel';
import { useAuth } from '../hooks/useAuth';
import type { Activity, Opportunity, Quote } from '../types';

export default function OpportunityDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState('resumen');
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const query = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => apiGet<Opportunity>(`/opportunities/${id}`),
    enabled: Boolean(id),
  });

  const quotesQuery = useQuery({
    queryKey: ['opportunity', id, 'quotes'],
    queryFn: () => apiList<Quote>('/quotes', { opportunityId: id, pageSize: 50 }),
    enabled: tab === 'cotizaciones',
  });

  const activitiesQuery = useQuery({
    queryKey: ['opportunity', id, 'activities'],
    queryFn: () => apiList<Activity>('/activities', { opportunityId: id, pageSize: 50 }),
    enabled: tab === 'actividades',
  });

  if (query.isLoading) return <FullPageSpinner message="Cargando oportunidad…" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const opportunity = query.data!;

  const quoteColumns: Array<Column<Quote>> = [
    { key: 'number', header: 'Número', render: (row) => row.number },
    { key: 'issueDate', header: 'Emisión', render: (row) => formatDate(row.issueDate) },
    { key: 'total', header: 'Total', align: 'right', render: (row) => formatMoney(row.total) },
    { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.status} /> },
  ];

  const activityColumns: Array<Column<Activity>> = [
    { key: 'type', header: 'Tipo', render: (row) => row.typeName },
    { key: 'subject', header: 'Asunto', render: (row) => row.subject },
    { key: 'scheduledAt', header: 'Fecha', render: (row) => formatDateTime(row.scheduledAt) },
    { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.status} /> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/oportunidades" className="inline-flex items-center gap-1 hover:text-brand-600">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al pipeline
          </Link>
        }
        title={opportunity.name}
        description={`${opportunity.code} · ${opportunity.clientName ?? 'Sin cliente'}`}
        actions={
          <>
            {can('opportunities.update') && (
              <Button variant="outline" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setMoveOpen(true)}>
                Cambiar etapa
              </Button>
            )}
            {can('opportunities.update') && (
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: opportunity.stageColor }} aria-hidden />
                <span className="font-medium text-slate-800">{opportunity.stageName}</span>
              </span>
              <StatusBadge value={opportunity.status} />
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Valor estimado</p>
              <p className="text-2xl font-semibold text-slate-900">{formatMoney(opportunity.amount)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Probabilidad {opportunity.probability}% · ponderado{' '}
                {formatMoney((Number(opportunity.amount) * opportunity.probability) / 100)}
              </p>
            </div>

            <dl className="space-y-2 border-t border-slate-100 pt-3">
              <Row label="Cliente" value={opportunity.clientName} link={opportunity.clientId ? `/clientes/${opportunity.clientId}` : undefined} />
              <Row label="Contacto" value={opportunity.contactName} />
              <Row label="Responsable" value={opportunity.ownerName ?? 'Sin asignar'} />
              <Row label="Fuente" value={opportunity.sourceName} />
              <Row label="Apertura" value={formatDate(opportunity.openedAt)} />
              <Row label="Cierre estimado" value={formatDate(opportunity.expectedCloseAt)} />
              <Row label="Cierre real" value={opportunity.closedAt ? formatDate(opportunity.closedAt) : '—'} />
              <Row label="Competencia" value={opportunity.competitor} />
            </dl>

            {opportunity.lostReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700">Motivo de pérdida</p>
                <p className="mt-0.5 text-sm text-red-600">{opportunity.lostReason}</p>
              </div>
            )}

            {opportunity.description && (
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Descripción</p>
                <p className="whitespace-pre-wrap text-sm text-slate-600">{opportunity.description}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <Tabs
            active={tab}
            onChange={setTab}
            items={[
              { key: 'resumen', label: 'Historial de etapas' },
              { key: 'cotizaciones', label: 'Cotizaciones' },
              { key: 'actividades', label: 'Actividades' },
              { key: 'documentos', label: 'Documentos' },
              { key: 'notas', label: 'Notas' },
            ]}
          />
          <CardBody>
            {tab === 'resumen' && (
              <ol className="relative space-y-1 border-l border-slate-200 pl-6">
                {(opportunity.history ?? []).map((entry) => (
                  <li key={entry.id} className="relative pb-4">
                    <span className="absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 ring-4 ring-white">
                      <History className="h-3.5 w-3.5" />
                    </span>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-sm font-medium text-slate-800">
                        {entry.fromStageName ? `${entry.fromStageName} → ${entry.toStageName}` : entry.toStageName}
                      </p>
                      {entry.note && <p className="mt-0.5 text-xs text-slate-500">{entry.note}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {entry.changedByName ?? 'Sistema'} · {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
                {(opportunity.history?.length ?? 0) === 0 && (
                  <p className="py-6 text-sm text-slate-500">Sin movimientos registrados.</p>
                )}
              </ol>
            )}

            {tab === 'cotizaciones' && (
              <>
                {can('quotes.create') && (
                  <div className="mb-3 flex justify-end">
                    <Button
                      size="sm"
                      icon={<FileText className="h-4 w-4" />}
                      onClick={() =>
                        navigate(
                          `/cotizaciones/nueva?clientId=${opportunity.clientId ?? ''}&opportunityId=${opportunity.id}`,
                        )
                      }
                    >
                      Nueva cotización
                    </Button>
                  </div>
                )}
                <DataTable
                  columns={quoteColumns}
                  rows={quotesQuery.data?.data ?? []}
                  rowKey={(row) => row.id}
                  loading={quotesQuery.isLoading}
                  onRowClick={(row) => navigate(`/cotizaciones/${row.id}`)}
                  emptyTitle="Sin cotizaciones"
                  emptyMessage="Genere una cotización para esta oportunidad."
                />
              </>
            )}

            {tab === 'actividades' && (
              <DataTable
                columns={activityColumns}
                rows={activitiesQuery.data?.data ?? []}
                rowKey={(row) => row.id}
                loading={activitiesQuery.isLoading}
                emptyTitle="Sin actividades"
                emptyMessage="Registre llamadas, reuniones o correos vinculados a esta oportunidad."
              />
            )}

            {tab === 'documentos' && <DocumentsPanel scope={{ opportunityId: opportunity.id }} />}
            {tab === 'notas' && <NotesPanel scope={{ opportunityId: opportunity.id }} />}
          </CardBody>
        </Card>
      </div>

      <OpportunityFormModal open={editOpen} onClose={() => setEditOpen(false)} opportunity={opportunity} />
      {moveOpen && <MoveStageModal opportunity={opportunity} onClose={() => setMoveOpen(false)} />}
    </>
  );
}

function Row({ label, value, link }: { label: string; value?: string | null; link?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="truncate text-right text-slate-700">
        {link && value ? (
          <Link to={link} className="text-brand-600 hover:underline">
            {value}
          </Link>
        ) : (
          (value ?? '—')
        )}
      </dd>
    </div>
  );
}
