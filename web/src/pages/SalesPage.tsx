import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiList, apiPatch, errorMessage } from '../lib/api';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useUserOptions } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Field';
import { ErrorState } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import { ExportMenu } from '../components/ExportMenu';
import type { Sale } from '../types';

export default function SalesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'saleDate', sortDir: 'desc' });
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['sales', table.queryParams],
    queryFn: () => apiList<Sale>('/sales', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const detailQuery = useQuery({
    queryKey: ['sale', detailId],
    queryFn: () => apiGet<Sale>(`/sales/${detailId}`),
    enabled: Boolean(detailId),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/sales/${id}`, { status }),
    onSuccess: () => {
      toast.success('Estado de la venta actualizado');
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['sale'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns = useMemo<Array<Column<Sale>>>(
    () => [
      { key: 'number', header: 'Número', sortKey: 'number', render: (row) => <span className="font-medium text-slate-900">{row.number}</span> },
      { key: 'client', header: 'Cliente', render: (row) => row.clientName },
      { key: 'quote', header: 'Cotización', hideOnMobile: true, render: (row) => row.quoteNumber ?? '—' },
      { key: 'saleDate', header: 'Fecha', sortKey: 'saleDate', render: (row) => formatDate(row.saleDate) },
      { key: 'total', header: 'Total', sortKey: 'total', align: 'right', render: (row) => formatMoney(row.total) },
      {
        key: 'status',
        header: 'Estado',
        sortKey: 'status',
        render: (row) =>
          can('sales.update') && row.status !== 'ANULADA' ? (
            <div onClick={(event) => event.stopPropagation()}>
              <Select
                aria-label={`Estado de la venta ${row.number}`}
                value={row.status}
                onChange={(event) => changeStatus.mutate({ id: row.id, status: event.target.value })}
                className="h-8 w-auto py-0 text-xs"
              >
                <option value="PENDIENTE">Pendiente</option>
                <option value="FACTURADA">Facturada</option>
                <option value="COBRADA">Cobrada</option>
                <option value="ANULADA">Anulada</option>
              </Select>
            </div>
          ) : (
            <StatusBadge value={row.status} />
          ),
      },
      { key: 'owner', header: 'Ejecutivo', hideOnMobile: true, render: (row) => row.ownerName ?? '—' },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '56px',
        render: (row) => (
          <div onClick={(event) => event.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Ver detalle" onClick={() => setDetailId(row.id)}>
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [can, changeStatus],
  );

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const sale = detailQuery.data;

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Ventas registradas a partir de cotizaciones aceptadas u oportunidades ganadas."
        actions={can('sales.export') ? <ExportMenu url="/sales/export" params={table.queryParams} fileName="ventas" /> : undefined}
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
                { value: 'PENDIENTE', label: 'Pendiente' },
                { value: 'FACTURADA', label: 'Facturada' },
                { value: 'COBRADA', label: 'Cobrada' },
                { value: 'ANULADA', label: 'Anulada' },
              ]}
            />
            {can('sales.delete') && (
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
        emptyTitle="Sin ventas"
        emptyMessage="Las ventas se generan desde una cotización aceptada."
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={sale ? `Venta ${sale.number}` : 'Detalle de venta'}
        description={sale?.clientName}
        size="lg"
      >
        {detailQuery.isLoading && <div className="skeleton h-32 w-full" />}
        {sale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Info label="Fecha" value={formatDate(sale.saleDate)} />
              <Info label="Estado" value={<StatusBadge value={sale.status} />} />
              <Info label="Cotización" value={sale.quoteNumber ?? '—'} />
              <Info label="Ejecutivo" value={sale.ownerName ?? '—'} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-right">P. unitario</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(item.quantity, 2)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd>{formatMoney(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Impuestos</dt>
                <dd>{formatMoney(sale.taxTotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatMoney(sale.total)}</dd>
              </div>
            </dl>
            {sale.status === 'ANULADA' && (
              <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <Ban className="h-4 w-4" /> Esta venta fue anulada.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-800">{value}</p>
    </div>
  );
}
