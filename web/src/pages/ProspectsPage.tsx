import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiList, errorMessage } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
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
import { ProspectFormModal } from '../features/prospects/ProspectFormModal';
import { ConvertProspectModal } from '../features/prospects/ConvertProspectModal';
import { cn } from '../lib/utils';
import type { Prospect } from '../types';

export default function ProspectsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'createdAt', sortDir: 'desc' });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [converting, setConverting] = useState<Prospect | null>(null);
  const [toDelete, setToDelete] = useState<Prospect | null>(null);

  const query = useQuery({
    queryKey: ['prospects', table.queryParams],
    queryFn: () => apiList<Prospect>('/prospects', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (prospect: Prospect) => apiDelete(`/prospects/${prospect.id}`),
    onSuccess: () => {
      toast.success('Prospecto eliminado');
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const columns = useMemo<Array<Column<Prospect>>>(
    () => [
      {
        key: 'name',
        header: 'Prospecto',
        sortKey: 'lastName',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">
              {row.firstName} {row.lastName ?? ''}
            </p>
            <p className="truncate text-xs text-slate-500">
              {row.code}
              {row.companyName ? ` · ${row.companyName}` : ''}
            </p>
          </div>
        ),
      },
      {
        key: 'contact',
        header: 'Contacto',
        hideOnMobile: true,
        render: (row) => (
          <div className="min-w-0 text-xs">
            <p className="truncate text-slate-700">{row.email ?? '—'}</p>
            <p className="truncate text-slate-500">{row.mobile ?? row.phone ?? '—'}</p>
          </div>
        ),
      },
      { key: 'source', header: 'Fuente', hideOnMobile: true, render: (row) => row.sourceName ?? '—' },
      { key: 'status', header: 'Estado', sortKey: 'status', render: (row) => <StatusBadge value={row.status} /> },
      {
        key: 'temperature',
        header: 'Temperatura',
        sortKey: 'temperature',
        render: (row) => <StatusBadge value={row.temperature} />,
      },
      {
        key: 'estimatedValue',
        header: 'Valor est.',
        align: 'right',
        hideOnMobile: true,
        render: (row) => (row.estimatedValue ? formatMoney(row.estimatedValue) : '—'),
      },
      {
        key: 'nextFollowUpAt',
        header: 'Seguimiento',
        sortKey: 'nextFollowUpAt',
        render: (row) => {
          if (!row.nextFollowUpAt) return '—';
          const overdue =
            new Date(row.nextFollowUpAt) < new Date() && !['CONVERTIDO', 'PERDIDO'].includes(row.status);
          return (
            <span className={cn('text-sm', overdue ? 'font-medium text-red-600' : 'text-slate-600')}>
              {formatDate(row.nextFollowUpAt)}
            </span>
          );
        },
      },
      { key: 'owner', header: 'Responsable', hideOnMobile: true, render: (row) => row.ownerName ?? 'Sin asignar' },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '132px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {can('clients.create') && row.status !== 'CONVERTIDO' && (
              <Button
                variant="ghost"
                size="icon"
                title="Convertir en cliente"
                aria-label={`Convertir ${row.firstName} en cliente`}
                className="text-emerald-600 hover:bg-emerald-50"
                onClick={() => setConverting(row)}
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            )}
            {can('prospects.update') && (
              <Button
                variant="ghost"
                size="icon"
                title="Editar"
                aria-label="Editar prospecto"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('prospects.delete') && (
              <Button
                variant="ghost"
                size="icon"
                title="Eliminar"
                aria-label="Eliminar prospecto"
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
    [can],
  );

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <>
      <PageHeader
        title="Prospectos"
        description="Oportunidades de negocio en etapa de prospección."
        actions={
          <>
            {can('prospects.export') && (
              <ExportMenu url="/prospects/export" params={table.queryParams} fileName="prospectos" />
            )}
            {can('prospects.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Nuevo prospecto
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por nombre, empresa, correo o código…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            <FilterSelect
              label="Estado"
              value={table.state.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={[
                { value: 'NUEVO', label: 'Nuevo' },
                { value: 'CONTACTADO', label: 'Contactado' },
                { value: 'CALIFICADO', label: 'Calificado' },
                { value: 'EN_NEGOCIACION', label: 'En negociación' },
                { value: 'CONVERTIDO', label: 'Convertido' },
                { value: 'PERDIDO', label: 'Perdido' },
              ]}
            />
            <FilterSelect
              label="Temperatura"
              value={table.state.filters.temperature}
              onChange={(value) => table.setFilter('temperature', value)}
              options={[
                { value: 'FRIO', label: 'Frío' },
                { value: 'TIBIO', label: 'Tibio' },
                { value: 'CALIENTE', label: 'Caliente' },
              ]}
            />
            <FilterSelect
              label="Fuente"
              value={table.state.filters.sourceId}
              onChange={(value) => table.setFilter('sourceId', value)}
              options={(catalogs?.prospectSources ?? []).map((source) => ({ value: source.id, label: source.name }))}
            />
            <FilterSelect
              label="Seguimiento"
              value={table.state.filters.overdueFollowUp}
              onChange={(value) => table.setFilter('overdueFollowUp', value)}
              options={[{ value: 'true', label: 'Solo vencidos' }]}
            />
            {can('prospects.delete') && (
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
        emptyTitle="Sin prospectos"
        emptyMessage="Registre su primer prospecto para iniciar el proceso comercial."
        emptyAction={
          can('prospects.create') ? (
            <Button
              icon={<UserPlus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Crear prospecto
            </Button>
          ) : undefined
        }
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <ProspectFormModal open={formOpen} onClose={() => setFormOpen(false)} prospect={editing} />
      {converting && (
        <ConvertProspectModal open onClose={() => setConverting(null)} prospect={converting} />
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar prospecto"
        message={`¿Desea eliminar al prospecto "${toDelete?.firstName ?? ''} ${toDelete?.lastName ?? ''}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
