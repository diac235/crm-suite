import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiDownload, apiList, errorMessage } from '../lib/api';
import { formatDateTime, label } from '../lib/format';
import { downloadBlob } from '../lib/utils';
import { useTableState } from '../hooks/useTableState';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import type { DocumentItem } from '../types';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const table = useTableState({ sortBy: 'createdAt', sortDir: 'desc' });
  const [toDelete, setToDelete] = useState<DocumentItem | null>(null);

  const query = useQuery({
    queryKey: ['documents', 'all', table.queryParams],
    queryFn: () => apiList<DocumentItem>('/documents', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (document: DocumentItem) => apiDelete(`/documents/${document.id}`),
    onSuccess: () => {
      toast.success('Documento eliminado');
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const download = async (document: DocumentItem) => {
    try {
      const result = await apiDownload(`/documents/${document.id}/download`, undefined, document.originalName);
      downloadBlob(result.blob, result.fileName);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns = useMemo<Array<Column<DocumentItem>>>(
    () => [
      {
        key: 'name',
        header: 'Documento',
        sortKey: 'name',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.name}</p>
            <p className="truncate text-xs text-slate-500">{row.originalName}</p>
          </div>
        ),
      },
      { key: 'category', header: 'Categoría', sortKey: 'category', render: (row) => <Badge>{label(row.category)}</Badge> },
      {
        key: 'related',
        header: 'Asociado a',
        hideOnMobile: true,
        render: (row) => row.clientName ?? row.prospectId ?? row.opportunityId ?? '—',
      },
      { key: 'size', header: 'Tamaño', sortKey: 'sizeBytes', align: 'right', render: (row) => humanSize(row.sizeBytes) },
      { key: 'uploader', header: 'Subido por', hideOnMobile: true, render: (row) => row.uploadedByName ?? '—' },
      { key: 'createdAt', header: 'Fecha', sortKey: 'createdAt', render: (row) => formatDateTime(row.createdAt) },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '96px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" aria-label="Descargar" onClick={() => void download(row)}>
              <Download className="h-4 w-4" />
            </Button>
            {can('documents.delete') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar documento"
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
        title="Documentos"
        description="Archivos adjuntos a clientes, prospectos, oportunidades y cotizaciones."
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por nombre de archivo…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <FilterSelect
            label="Categoría"
            value={table.state.filters.category}
            onChange={(value) => table.setFilter('category', value)}
            options={['CONTRATO', 'FACTURA', 'COTIZACION', 'ORDEN_COMPRA', 'IDENTIFICACION', 'IMAGEN', 'OTRO'].map(
              (value) => ({ value, label: label(value) }),
            )}
          />
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
        emptyTitle="Sin documentos"
        emptyMessage="Los documentos se suben desde la ficha de cada cliente, oportunidad o cotización."
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar documento"
        message={`El archivo "${toDelete?.name ?? ''}" se eliminará del almacenamiento. ¿Desea continuar?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
