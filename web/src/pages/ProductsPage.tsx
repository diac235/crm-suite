import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiList, apiPatch, apiPost, errorMessage } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useCatalogs } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Checkbox, Field, Input, Select, Textarea } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import { ExportMenu } from '../components/ExportMenu';
import type { Product } from '../types';

const schema = z.object({
  sku: z.string().trim().min(1, 'El código es obligatorio').max(40),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(120).optional(),
  unit: z.string().trim().min(1).max(30),
  price: z.coerce.number().min(0),
  cost: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  taxRateId: z.string().optional(),
  isActive: z.boolean(),
});

type FormValues = z.input<typeof schema>;

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: catalogs } = useCatalogs();
  const table = useTableState({ sortBy: 'name', sortDir: 'asc' });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const query = useQuery({
    queryKey: ['products', table.queryParams],
    queryFn: () => apiList<Product>('/products', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!formOpen) return;
    reset({
      sku: editing?.sku ?? '',
      name: editing?.name ?? '',
      description: editing?.description ?? '',
      category: editing?.category ?? '',
      unit: editing?.unit ?? 'UNIDAD',
      price: editing ? Number(editing.price) : 0,
      cost: editing?.cost ? Number(editing.cost) : '',
      taxRateId: editing?.taxRateId ?? catalogs?.taxRates.find((rate) => rate.isDefault)?.id ?? '',
      isActive: editing?.isActive ?? true,
    });
  }, [formOpen, editing, catalogs, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, cost: values.cost === '' ? null : values.cost, taxRateId: values.taxRateId || null };
      return editing ? apiPatch(`/products/${editing.id}`, payload) : apiPost('/products', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Producto actualizado' : 'Producto creado');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setFormOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (product: Product) => apiDelete(`/products/${product.id}`),
    onSuccess: () => {
      toast.success('Producto eliminado o desactivado');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const columns = useMemo<Array<Column<Product>>>(
    () => [
      { key: 'sku', header: 'SKU', sortKey: 'sku', render: (row) => <span className="font-mono text-xs">{row.sku}</span> },
      {
        key: 'name',
        header: 'Producto / Servicio',
        sortKey: 'name',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.name}</p>
            {row.description && <p className="truncate text-xs text-slate-500">{row.description}</p>}
          </div>
        ),
      },
      { key: 'category', header: 'Categoría', sortKey: 'category', hideOnMobile: true, render: (row) => row.category ?? '—' },
      { key: 'unit', header: 'Unidad', hideOnMobile: true, render: (row) => row.unit },
      { key: 'price', header: 'Precio', sortKey: 'price', align: 'right', render: (row) => formatMoney(row.price) },
      { key: 'tax', header: 'Impuesto', hideOnMobile: true, render: (row) => row.taxRateName ?? '—' },
      { key: 'status', header: 'Estado', render: (row) => <StatusBadge value={row.isActive ? 'ACTIVO' : 'INACTIVO'} /> },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '96px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            {can('products.update') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar producto"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('products.delete') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar producto"
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
        title="Productos y servicios"
        description="Catálogo utilizado en cotizaciones y ventas."
        actions={
          <>
            {can('products.export') && <ExportMenu url="/products/export" params={table.queryParams} fileName="productos" />}
            {can('products.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Nuevo producto
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por nombre, SKU o categoría…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <FilterSelect
            label="Estado"
            value={table.state.filters.isActive}
            onChange={(value) => table.setFilter('isActive', value)}
            options={[
              { value: 'true', label: 'Activos' },
              { value: 'false', label: 'Inactivos' },
            ]}
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
        emptyTitle="Sin productos"
        emptyMessage="Registre los productos o servicios que ofrece."
        emptyAction={
          can('products.create') ? (
            <Button
              icon={<Package className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Crear producto
            </Button>
          ) : undefined
        }
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button form="product-form" type="submit" loading={save.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          id="product-form"
          onSubmit={handleSubmit((values) => save.mutate(values))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field label="SKU" required error={errors.sku?.message}>
            <Input {...register('sku')} invalid={Boolean(errors.sku)} />
          </Field>
          <Field label="Unidad" required error={errors.unit?.message}>
            <Input {...register('unit')} invalid={Boolean(errors.unit)} />
          </Field>
          <Field label="Nombre" required error={errors.name?.message} className="sm:col-span-2">
            <Input {...register('name')} invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Categoría" error={errors.category?.message}>
            <Input {...register('category')} />
          </Field>
          <Field label="Impuesto" error={errors.taxRateId?.message}>
            <Select {...register('taxRateId')}>
              <option value="">Sin impuesto</option>
              {catalogs?.taxRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Precio de venta" required error={errors.price?.message}>
            <Input type="number" step="0.01" min="0" {...register('price')} invalid={Boolean(errors.price)} />
          </Field>
          <Field label="Costo" error={errors.cost?.message}>
            <Input type="number" step="0.01" min="0" {...register('cost')} />
          </Field>
          <Field label="Descripción" error={errors.description?.message} className="sm:col-span-2">
            <Textarea rows={3} {...register('description')} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox label="Producto activo" {...register('isActive')} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar producto"
        message={`Si "${toDelete?.name ?? ''}" ya se usó en cotizaciones o ventas, se desactivará en lugar de eliminarse para no afectar los documentos históricos.`}
        confirmLabel="Continuar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
