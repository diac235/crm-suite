import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Smartphone,
  Star,
  User,
} from 'lucide-react';
import { apiGet, apiList, errorMessage } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, formatNumber, label } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type Column } from '../components/ui/DataTable';
import { ErrorState, FullPageSpinner } from '../components/ui/Spinner';
import { ClientFormModal } from '../features/clients/ClientFormModal';
import { ContactFormModal } from '../features/contacts/ContactFormModal';
import { NotesPanel } from '../features/notes/NotesPanel';
import { DocumentsPanel } from '../features/documents/DocumentsPanel';
import { TimelinePanel } from '../features/timeline/TimelinePanel';
import { useAuth } from '../hooks/useAuth';
import type { Activity, Client, Contact, Opportunity, Quote, Task } from '../types';

interface Summary {
  opportunitiesOpen: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  pipelineValue: string;
  quotesTotal: number;
  quotesAccepted: number;
  quotesPending: number;
  salesCount: number;
  salesTotal: string;
  salesPending: string;
  activitiesTotal: number;
  activitiesPending: number;
  lastInteractionAt: string | null;
}

export default function ClientDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState('historial');
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const clientQuery = useQuery({
    queryKey: ['client', id],
    queryFn: () => apiGet<Client>(`/clients/${id}`),
    enabled: Boolean(id),
  });

  const summaryQuery = useQuery({
    queryKey: ['client', id, 'summary'],
    queryFn: () => apiGet<Summary>(`/clients/${id}/summary`),
    enabled: Boolean(id),
  });

  const opportunitiesQuery = useQuery({
    queryKey: ['client', id, 'opportunities'],
    queryFn: () => apiList<Opportunity>('/opportunities', { clientId: id, pageSize: 50 }),
    enabled: tab === 'oportunidades',
  });

  const quotesQuery = useQuery({
    queryKey: ['client', id, 'quotes'],
    queryFn: () => apiList<Quote>('/quotes', { clientId: id, pageSize: 50 }),
    enabled: tab === 'cotizaciones',
  });

  const activitiesQuery = useQuery({
    queryKey: ['client', id, 'activities'],
    queryFn: () => apiList<Activity>('/activities', { clientId: id, pageSize: 50 }),
    enabled: tab === 'actividades',
  });

  const tasksQuery = useQuery({
    queryKey: ['client', id, 'tasks'],
    queryFn: () => apiList<Task>('/tasks', { clientId: id, pageSize: 50 }),
    enabled: tab === 'tareas',
  });

  if (clientQuery.isLoading) return <FullPageSpinner message="Cargando cliente…" />;
  if (clientQuery.isError) {
    return <ErrorState message={errorMessage(clientQuery.error)} onRetry={() => clientQuery.refetch()} />;
  }

  const client = clientQuery.data!;
  const summary = summaryQuery.data;

  const opportunityColumns: Array<Column<Opportunity>> = [
    { key: 'code', header: 'Código', render: (row) => row.code },
    { key: 'name', header: 'Nombre', render: (row) => row.name },
    { key: 'stage', header: 'Etapa', render: (row) => row.stageName },
    { key: 'amount', header: 'Valor', align: 'right', render: (row) => formatMoney(row.amount) },
    { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'close', header: 'Cierre estimado', hideOnMobile: true, render: (row) => formatDate(row.expectedCloseAt) },
  ];

  const quoteColumns: Array<Column<Quote>> = [
    { key: 'number', header: 'Número', render: (row) => row.number },
    { key: 'issueDate', header: 'Emisión', render: (row) => formatDate(row.issueDate) },
    { key: 'validUntil', header: 'Vigencia', hideOnMobile: true, render: (row) => formatDate(row.validUntil) },
    { key: 'total', header: 'Total', align: 'right', render: (row) => formatMoney(row.total) },
    { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.status} /> },
  ];

  const activityColumns: Array<Column<Activity>> = [
    { key: 'type', header: 'Tipo', render: (row) => row.typeName },
    { key: 'subject', header: 'Asunto', render: (row) => row.subject },
    { key: 'scheduledAt', header: 'Fecha', render: (row) => formatDateTime(row.scheduledAt) },
    { key: 'owner', header: 'Responsable', hideOnMobile: true, render: (row) => row.ownerName ?? '—' },
    { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.status} /> },
  ];

  const taskColumns: Array<Column<Task>> = [
    { key: 'title', header: 'Tarea', render: (row) => row.title },
    { key: 'priority', header: 'Prioridad', render: (row) => <StatusBadge value={row.priority} /> },
    { key: 'dueAt', header: 'Vence', render: (row) => formatDate(row.dueAt) },
    { key: 'assignee', header: 'Responsable', hideOnMobile: true, render: (row) => row.assigneeName ?? '—' },
    { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.status} /> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/clientes" className="inline-flex items-center gap-1 hover:text-brand-600">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a clientes
          </Link>
        }
        title={client.legalName}
        description={`${client.code}${client.tradeName ? ` · ${client.tradeName}` : ''}`}
        actions={
          can('clients.update') ? (
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
              Editar cliente
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Ficha lateral con los datos maestros */}
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{client.legalName}</p>
                  <p className="text-xs text-slate-500">{label(client.kind)}</p>
                  <div className="mt-1">
                    <StatusBadge value={client.status} />
                  </div>
                </div>
              </div>

              <dl className="space-y-2 border-t border-slate-100 pt-3 text-sm">
                <InfoRow icon={<User className="h-4 w-4" />} label="Identificación" value={client.taxId} />
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Correo" value={client.email} isEmail />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Teléfono" value={client.phone} />
                <InfoRow icon={<Smartphone className="h-4 w-4" />} label="Celular" value={client.mobile} />
                <InfoRow icon={<Globe className="h-4 w-4" />} label="Sitio web" value={client.website} isLink />
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Ubicación"
                  value={[client.address, client.city, client.state, client.country].filter(Boolean).join(', ')}
                />
              </dl>

              <dl className="space-y-2 border-t border-slate-100 pt-3 text-sm">
                <SimpleRow label="Sector" value={client.sectorName} />
                <SimpleRow label="Actividad económica" value={client.economicActivity} />
                <SimpleRow label="Ejecutivo" value={client.ownerName ?? 'Sin asignar'} />
                <SimpleRow label="Límite de crédito" value={client.creditLimit ? formatMoney(client.creditLimit) : null} />
                <SimpleRow label="Creado" value={formatDate(client.createdAt)} />
                <SimpleRow label="Última actualización" value={formatDateTime(client.updatedAt)} />
              </dl>

              {client.notes && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Observaciones</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">{client.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {summary && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Facturado" value={formatMoney(summary.salesTotal)} tone="success" />
              <StatCard label="Pipeline" value={formatMoney(summary.pipelineValue)} tone="brand" />
              <StatCard label="Oport. abiertas" value={formatNumber(summary.opportunitiesOpen)} tone="info" />
              <StatCard label="Cotizaciones" value={formatNumber(summary.quotesTotal)} tone="neutral" />
            </div>
          )}
        </div>

        {/* Panel principal con pestañas */}
        <Card className="min-w-0">
          <Tabs
            active={tab}
            onChange={setTab}
            items={[
              { key: 'historial', label: 'Historial' },
              { key: 'contactos', label: 'Contactos', badge: client.contacts?.length ?? 0 },
              { key: 'oportunidades', label: 'Oportunidades' },
              { key: 'cotizaciones', label: 'Cotizaciones' },
              { key: 'actividades', label: 'Actividades' },
              { key: 'tareas', label: 'Tareas' },
              { key: 'documentos', label: 'Documentos' },
              { key: 'notas', label: 'Notas' },
            ]}
          />

          <CardBody>
            {tab === 'historial' && <TimelinePanel clientId={client.id} />}

            {tab === 'contactos' && (
              <div className="space-y-3">
                {can('contacts.create') && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      icon={<Plus className="h-4 w-4" />}
                      onClick={() => {
                        setEditingContact(null);
                        setContactOpen(true);
                      }}
                    >
                      Nuevo contacto
                    </Button>
                  </div>
                )}
                {(client.contacts?.length ?? 0) === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">Este cliente aún no tiene contactos.</p>
                )}
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {client.contacts?.map((contact) => (
                    <li key={contact.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium text-slate-900">
                            {contact.isPrimary && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                            {contact.firstName} {contact.lastName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {[contact.position, contact.department].filter(Boolean).join(' · ') || 'Sin cargo'}
                          </p>
                        </div>
                        {can('contacts.update') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${contact.firstName}`}
                            onClick={() => {
                              setEditingContact(contact);
                              setContactOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {contact.email && (
                          <p className="truncate">
                            <a href={`mailto:${contact.email}`} className="hover:text-brand-600">
                              {contact.email}
                            </a>
                          </p>
                        )}
                        {contact.mobile && <p>{contact.mobile}</p>}
                        {contact.phone && <p>{contact.phone}</p>}
                        {!contact.isActive && <StatusBadge value="INACTIVO" />}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === 'oportunidades' && (
              <DataTable
                columns={opportunityColumns}
                rows={opportunitiesQuery.data?.data ?? []}
                rowKey={(row) => row.id}
                loading={opportunitiesQuery.isLoading}
                onRowClick={(row) => navigate(`/oportunidades/${row.id}`)}
                emptyTitle="Sin oportunidades"
                emptyMessage="Este cliente no tiene oportunidades registradas."
              />
            )}

            {tab === 'cotizaciones' && (
              <DataTable
                columns={quoteColumns}
                rows={quotesQuery.data?.data ?? []}
                rowKey={(row) => row.id}
                loading={quotesQuery.isLoading}
                onRowClick={(row) => navigate(`/cotizaciones/${row.id}`)}
                emptyTitle="Sin cotizaciones"
                emptyMessage="Este cliente no tiene cotizaciones registradas."
              />
            )}

            {tab === 'actividades' && (
              <DataTable
                columns={activityColumns}
                rows={activitiesQuery.data?.data ?? []}
                rowKey={(row) => row.id}
                loading={activitiesQuery.isLoading}
                emptyTitle="Sin actividades"
                emptyMessage="No hay interacciones registradas con este cliente."
              />
            )}

            {tab === 'tareas' && (
              <DataTable
                columns={taskColumns}
                rows={tasksQuery.data?.data ?? []}
                rowKey={(row) => row.id}
                loading={tasksQuery.isLoading}
                emptyTitle="Sin tareas"
                emptyMessage="No hay tareas asociadas a este cliente."
              />
            )}

            {tab === 'documentos' && <DocumentsPanel scope={{ clientId: client.id }} />}
            {tab === 'notas' && <NotesPanel scope={{ clientId: client.id }} />}
          </CardBody>
        </Card>
      </div>

      <ClientFormModal open={editOpen} onClose={() => setEditOpen(false)} client={client} />
      <ContactFormModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        clientId={client.id}
        contact={editingContact}
      />
    </>
  );
}

function InfoRow({
  icon,
  label: rowLabel,
  value,
  isEmail,
  isLink,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  isEmail?: boolean;
  isLink?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-400">{rowLabel}</dt>
        <dd className="truncate text-slate-700">
          {isEmail ? (
            <a href={`mailto:${value}`} className="hover:text-brand-600">
              {value}
            </a>
          ) : isLink ? (
            <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer noopener" className="hover:text-brand-600">
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}

function SimpleRow({ label: rowLabel, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-400">{rowLabel}</dt>
      <dd className="truncate text-right text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
