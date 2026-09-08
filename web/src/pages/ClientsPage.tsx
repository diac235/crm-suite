import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiList, apiPost, errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
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
import { ClientFormModal } from '../features/clients/ClientFormModal';
import type { Client } from '../types';

export default function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'createdAt', sortDir: 'desc' });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'archive' | 'restore' | 'delete'; client: Client } | null>(null);

  const query = useQuery({
    queryKey: ['clients', table.queryParams],
    queryFn: () => apiList<Client>('/clients', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clients'] });

  const archiveMutation = useMutation({
    mutationFn: (client: Client) => apiPost(`/clients/${client.id}/archive`),
    onSuccess: () => {
      toast.success('Cliente archivado');
      void invalidate();
      setConfirm(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restoreMutation = useMutation({
    mutationFn: (client: Client) => apiPost(`/clients/${client.id}/restore`),
    onSuccess: () => {
      toast.success('Cliente reactivado');
      void invalidate();
      setConfirm(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (client: Client) => apiDelete(`/clients/${client.id}`),
    onSuccess: () => {
      toast.success('Cliente eliminado');
      void invalidate();
      setConfirm(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirm(null);
    },
  });

  const columns = useMemo<Array<Column<Client>>>(
    () => [
      {
        key: 'legalName',
        header: 'Cliente',
        sortKey: 'legalName',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.legalName}</p>
            <p className="truncate text-xs text-slate-500">
              {row.code}
              {row.tradeName ? ` · ${row.tradeName}` : ''}
            </p>
          </div>
        ),
      },
      { key: 'taxId', header: 'Identificación', hideOnMobile: true, render: (row) => row.taxId ?? '—' },
      {
        key: 'contact',
        header: 'Contacto',
        hideOnMobile: true,
        render: (row) => (
          <div className="min-w-0 text-xs">
            <p className="truncate text-slate-700">{row.email ?? '—'}</p>
            <p className="truncate text-slate-500">{row.phone ?? row.mobile ?? '—'}</p>
          </div>
        ),
      },
      { key: 'city', header: 'Ciudad', sortKey: 'city', hideOnMobile: true, render: (row) => row.city ?? '—' },
      { key: 'sector', header: 'Sector', hideOnMobile: true, render: (row) => row.sectorName ?? '—' },
      { key: 'owner', header: 'Ejecutivo', hideOnMobile: true, render: (row) => row.ownerName ?? 'Sin asignar' },
      { key: 'status', header: 'Estado', sortKey: 'status', render: (row) => <StatusBadge value={row.status} /> },
      {
        key: 'createdAt',
        header: 'Creado',
        sortKey: 'createdAt',
        hideOnMobile: true,
        render: (row) => formatDate(row.createdAt),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '120px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {can('clients.update') && (
              <Button
                variant="ghost"
                size="icon"
                title="Editar"
                aria-label={`Editar ${row.legalName}`}
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('clients.update') &&
              (row.status === 'ARCHIVADO' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reactivar"
                  aria-label={`Reactivar ${row.legalName}`}
                  onClick={() => setConfirm({ type: 'restore', client: row })}
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Archivar"
                  aria-label={`Archivar ${row.legalName}`}
                  onClick={() => setConfirm({ type: 'archive', client: row })}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              ))}
            {can('clients.delete') && (
              <Button
                variant="ghost"
                size="icon"
                title="Eliminar"
                aria-label={`Eliminar ${row.legalName}`}
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => setConfirm({ type: 'delete', client: row })}
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

  const confirmConfig = confirm && {
    archive: {
      title: 'Archivar cliente',
      message: `¿Desea archivar a "${confirm.client.legalName}"? El cliente dejará de aparecer en los listados activos pero conservará todo su historial.`,
      confirmLabel: 'Archivar',
      tone: 'primary' as const,
      onConfirm: () => archiveMutation.mutate(confirm.client),
      loading: archiveMutation.isPending,
    },
    restore: {
      title: 'Reactivar cliente',
      message: `¿Desea reactivar a "${confirm.client.legalName}"?`,
      confirmLabel: 'Reactivar',
      tone: 'primary' as const,
      onConfirm: () => restoreMutation.mutate(confirm.client),
      loading: restoreMutation.isPending,
    },
    delete: {
      title: 'Eliminar cliente',
      message: `Esta acción eliminará a "${confirm.client.legalName}". Solo es posible si no tiene oportunidades, cotizaciones ni ventas asociadas.`,
      confirmLabel: 'Eliminar',
      tone: 'danger' as const,
      onConfirm: () => deleteMutation.mutate(confirm.client),
      loading: deleteMutation.isPending,
    },
  }[confirm.type];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cartera de clientes de la empresa."
        actions={
          <>
            {can('clients.export') && (
              <ExportMenu url="/clients/export" params={table.queryParams} fileName="clientes" />
            )}
            {can('clients.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Nuevo cliente
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por razón social, identificación, correo o código…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            <FilterSelect
              label="Estado"
              value={table.state.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={[
                { value: 'ACTIVO', label: 'Activo' },
                { value: 'INACTIVO', label: 'Inactivo' },
                { value: 'POTENCIAL', label: 'Potencial' },
                { value: 'ARCHIVADO', label: 'Archivado' },
              ]}
            />
            <FilterSelect
              label="Tipo"
              value={table.state.filters.kind}
              onChange={(value) => table.setFilter('kind', value)}
              options={[
                { value: 'EMPRESA', label: 'Empresa' },
                { value: 'PERSONA_NATURAL', label: 'Persona natural' },
                { value: 'GOBIERNO', label: 'Gobierno' },
                { value: 'ONG', label: 'ONG' },
              ]}
            />
            <FilterSelect
              label="Sector"
              value={table.state.filters.sectorId}
              onChange={(value) => table.setFilter('sectorId', value)}
              options={(catalogs?.sectors ?? []).map((sector) => ({ value: sector.id, label: sector.name }))}
            />
            {can('clients.delete') && (
              <FilterSelect
                label="Ejecutivo"
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
        onRowClick={(row) => navigate(`/clientes/${row.id}`)}
        emptyTitle="Aún no hay clientes"
        emptyMessage="Cree su primer cliente o ajuste los filtros de búsqueda."
        emptyAction={
          can('clients.create') ? (
            <Button
              icon={<Building2 className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Crear cliente
            </Button>
          ) : undefined
        }
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} client={editing} />

      {confirm && confirmConfig && (
        <ConfirmDialog
          open
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          tone={confirmConfig.tone}
          loading={confirmConfig.loading}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
