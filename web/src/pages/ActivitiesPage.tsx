import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity as ActivityIcon, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiList, apiPatch, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useCatalogs, useUserOptions } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { StatusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import { ExportMenu } from '../components/ExportMenu';
import { ActivityFormModal } from '../features/activities/ActivityFormModal';
import type { Activity } from '../types';

export default function ActivitiesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'scheduledAt', sortDir: 'desc' });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [toDelete, setToDelete] = useState<Activity | null>(null);

  const query = useQuery({
    queryKey: ['activities', table.queryParams],
    queryFn: () => apiList<Activity>('/activities', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const complete = useMutation({
    mutationFn: (activity: Activity) => apiPatch(`/activities/${activity.id}`, { status: 'COMPLETADA' }),
    onSuccess: () => {
      toast.success('Actividad marcada como completada');
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (activity: Activity) => apiDelete(`/activities/${activity.id}`),
    onSuccess: () => {
      toast.success('Actividad eliminada');
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const columns = useMemo<Array<Column<Activity>>>(
    () => [
      {
        key: 'type',
        header: 'Tipo',
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: row.typeColor }} aria-hidden />
            {row.typeName}
          </span>
        ),
      },
      {
        key: 'subject',
        header: 'Asunto',
        sortKey: 'subject',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.subject}</p>
            <p className="truncate text-xs text-slate-500">
              {row.clientName ?? row.prospectName ?? 'Sin cliente'}
              {row.opportunityName ? ` · ${row.opportunityName}` : ''}
            </p>
          </div>
        ),
      },
      {
        key: 'scheduledAt',
        header: 'Fecha y hora',
        sortKey: 'scheduledAt',
        render: (row) => formatDateTime(row.scheduledAt),
      },
      { key: 'duration', header: 'Duración', hideOnMobile: true, render: (row) => `${row.durationMin} min` },
      { key: 'owner', header: 'Responsable', hideOnMobile: true, render: (row) => row.ownerName ?? '—' },
      { key: 'status', header: 'Estado', sortKey: 'status', render: (row) => <StatusBadge value={row.status} /> },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '128px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            {can('activities.update') && row.status !== 'COMPLETADA' && (
              <Button
                variant="ghost"
                size="icon"
                title="Marcar como completada"
                aria-label="Marcar como completada"
                className="text-emerald-600 hover:bg-emerald-50"
                onClick={() => complete.mutate(row)}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            {can('activities.update') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar actividad"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('activities.delete') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar actividad"
                className="text-red-500 hover:bg-red-50"
                onClick={() => setToDelete(row)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [can, complete],
  );

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <>
      <PageHeader
        title="Actividades"
        description="Llamadas, reuniones, correos y visitas registradas."
        actions={
          <>
            {can('activities.export') && (
              <ExportMenu url="/activities/export" params={table.queryParams} fileName="actividades" />
            )}
            {can('activities.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Nueva actividad
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por asunto o descripción…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            <FilterSelect
              label="Estado"
              value={table.state.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={[
                { value: 'PENDIENTE', label: 'Pendiente' },
                { value: 'EN_PROGRESO', label: 'En progreso' },
                { value: 'COMPLETADA', label: 'Completada' },
                { value: 'CANCELADA', label: 'Cancelada' },
              ]}
            />
            <FilterSelect
              label="Tipo"
              value={table.state.filters.typeId}
              onChange={(value) => table.setFilter('typeId', value)}
              options={(catalogs?.activityTypes ?? []).map((type) => ({ value: type.id, label: type.name }))}
            />
            {can('activities.delete') && (
              <FilterSelect
                label="Responsable"
                value={table.state.filters.ownerId}
                onChange={(value) => table.setFilter('ownerId', value)}
                options={(users ?? []).map((user) => ({ value: user.id, label: user.label }))}
              />
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        sortBy={table.state.sortBy}
        sortDir={table.state.sortDir}
        onSort={table.toggleSort}
        emptyTitle="Sin actividades"
        emptyMessage="Registre la primera interacción con un cliente."
        emptyAction={
          can('activities.create') ? (
            <Button
              icon={<ActivityIcon className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Registrar actividad
            </Button>
          ) : undefined
        }
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <ActivityFormModal open={formOpen} onClose={() => setFormOpen(false)} activity={editing} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar actividad"
        message={`¿Desea eliminar la actividad "${toDelete?.subject ?? ''}"?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
