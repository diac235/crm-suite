import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiList, errorMessage } from '../lib/api';
import { useTableState } from '../hooks/useTableState';
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
import { ContactFormModal } from '../features/contacts/ContactFormModal';
import type { Contact } from '../types';

export default function ContactsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const table = useTableState({ sortBy: 'lastName', sortDir: 'asc' });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [toDelete, setToDelete] = useState<Contact | null>(null);

  const query = useQuery({
    queryKey: ['contacts', table.queryParams],
    queryFn: () => apiList<Contact>('/contacts', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (contact: Contact) => apiDelete(`/contacts/${contact.id}`),
    onSuccess: () => {
      toast.success('Contacto eliminado');
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const columns = useMemo<Array<Column<Contact>>>(
    () => [
      {
        key: 'name',
        header: 'Contacto',
        sortKey: 'lastName',
        render: (row) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-slate-900">
              {row.isPrimary && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
              {row.firstName} {row.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{row.position ?? 'Sin cargo'}</p>
          </div>
        ),
      },
      { key: 'client', header: 'Cliente', render: (row) => row.clientName ?? '—' },
      { key: 'department', header: 'Departamento', hideOnMobile: true, render: (row) => row.department ?? '—' },
      {
        key: 'email',
        header: 'Correo',
        sortKey: 'email',
        hideOnMobile: true,
        render: (row) =>
          row.email ? (
            <a href={`mailto:${row.email}`} className="text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.email}
            </a>
          ) : (
            '—'
          ),
      },
      { key: 'mobile', header: 'Celular', hideOnMobile: true, render: (row) => row.mobile ?? row.phone ?? '—' },
      {
        key: 'status',
        header: 'Estado',
        render: (row) => <StatusBadge value={row.isActive ? 'ACTIVO' : 'INACTIVO'} />,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '96px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {can('contacts.update') && (
              <Button variant="ghost" size="icon" aria-label="Editar contacto" onClick={() => setEditing(row)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('contacts.delete') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar contacto"
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
        title="Contactos"
        description="Personas de contacto asociadas a los clientes."
        actions={can('contacts.export') ? <ExportMenu url="/contacts/export" params={table.queryParams} fileName="contactos" /> : undefined}
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por nombre, correo, cargo o cliente…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            <FilterSelect
              label="Estado"
              value={table.state.filters.isActive}
              onChange={(value) => table.setFilter('isActive', value)}
              options={[
                { value: 'true', label: 'Activos' },
                { value: 'false', label: 'Inactivos' },
              ]}
            />
            <FilterSelect
              label="Principal"
              value={table.state.filters.isPrimary}
              onChange={(value) => table.setFilter('isPrimary', value)}
              options={[
                { value: 'true', label: 'Solo principales' },
                { value: 'false', label: 'No principales' },
              ]}
            />
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
        onRowClick={(row) => navigate(`/clientes/${row.clientId}`)}
        emptyTitle="Sin contactos"
        emptyMessage="Los contactos se crean desde la ficha de cada cliente."
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {editing && (
        <ContactFormModal
          open
          onClose={() => setEditing(null)}
          clientId={editing.clientId}
          contact={editing}
        />
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar contacto"
        message={`¿Desea eliminar a "${toDelete?.firstName ?? ''} ${toDelete?.lastName ?? ''}"?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
