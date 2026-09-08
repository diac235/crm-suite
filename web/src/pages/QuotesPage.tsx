import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiDownload, apiList, errorMessage } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { downloadBlob } from '../lib/utils';
import { useTableState } from '../hooks/useTableState';
import { useUserOptions } from '../hooks/useCatalogs';
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
import { cn } from '../lib/utils';
import type { Quote } from '../types';

export default function QuotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'issueDate', sortDir: 'desc' });
  const [toDelete, setToDelete] = useState<Quote | null>(null);

  const query = useQuery({
    queryKey: ['quotes', table.queryParams],
    queryFn: () => apiList<Quote>('/quotes', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (quote: Quote) => apiDelete(`/quotes/${quote.id}`),
    onSuccess: () => {
      toast.success('Cotización eliminada');
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const downloadPdf = async (quote: Quote) => {
    try {
      const result = await apiDownload(`/quotes/${quote.id}/pdf`, undefined, `${quote.number}.pdf`);
      downloadBlob(result.blob, result.fileName);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns = useMemo<Array<Column<Quote>>>(
    () => [
      {
        key: 'number',
        header: 'Número',
        sortKey: 'number',
        render: (row) => <span className="font-medium text-slate-900">{row.number}</span>,
      },
      { key: 'client', header: 'Cliente', render: (row) => row.clientName },
      { key: 'contact', header: 'Contacto', hideOnMobile: true, render: (row) => row.contactName ?? '—' },
      { key: 'issueDate', header: 'Emisión', sortKey: 'issueDate', render: (row) => formatDate(row.issueDate) },
      {
        key: 'validUntil',
        header: 'Vigencia',
        sortKey: 'validUntil',
        render: (row) => {
          const expired = new Date(row.validUntil) < new Date() && ['ENVIADA', 'EN_NEGOCIACION'].includes(row.status);
          return <span className={cn(expired && 'font-medium text-red-600')}>{formatDate(row.validUntil)}</span>;
        },
      },
      { key: 'total', header: 'Total', sortKey: 'total', align: 'right', render: (row) => formatMoney(row.total) },
      { key: 'status', header: 'Estado', sortKey: 'status', render: (row) => <StatusBadge value={row.status} /> },
      { key: 'owner', header: 'Ejecutivo', hideOnMobile: true, render: (row) => row.ownerName ?? '—' },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '96px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => void downloadPdf(row)}>
              <Printer className="h-4 w-4" />
            </Button>
            {can('quotes.delete') && row.status !== 'ACEPTADA' && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar cotización"
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
        title="Cotizaciones"
        description="Propuestas comerciales enviadas a los clientes."
        actions={
          <>
            {can('quotes.export') && <ExportMenu url="/quotes/export" params={table.queryParams} fileName="cotizaciones" />}
            {can('quotes.create') && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/cotizaciones/nueva')}>
                Nueva cotización
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por número o cliente…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            <FilterSelect
              label="Estado"
              value={table.state.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={[
                { value: 'BORRADOR', label: 'Borrador' },
                { value: 'ENVIADA', label: 'Enviada' },
                { value: 'EN_NEGOCIACION', label: 'En negociación' },
                { value: 'ACEPTADA', label: 'Aceptada' },
                { value: 'RECHAZADA', label: 'Rechazada' },
                { value: 'VENCIDA', label: 'Vencida' },
              ]}
            />
            {can('quotes.delete') && (
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
        onRowClick={(row) => navigate(`/cotizaciones/${row.id}`)}
        emptyTitle="Sin cotizaciones"
        emptyMessage="Genere su primera cotización para un cliente."
        emptyAction={
          can('quotes.create') ? (
            <Button icon={<FileText className="h-4 w-4" />} onClick={() => navigate('/cotizaciones/nueva')}>
              Crear cotización
            </Button>
          ) : undefined
        }
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar cotización"
        message={`¿Desea eliminar la cotización ${toDelete?.number ?? ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
