import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckSquare, MessageSquare, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiList, apiPatch, apiPost, errorMessage } from '../lib/api';
import { formatDateTime, toDateTimeInput } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useUserOptions } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import { ExportMenu } from '../components/ExportMenu';
import { apiList as listClients } from '../lib/api';
import type { Client, Task } from '../types';

const schema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['BAJA', 'MEDIA', 'ALTA', 'URGENTE']),
  status: z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA']),
  dueAt: z.string().optional(),
  assigneeId: z.string().optional(),
  clientId: z.string().optional(),
});

type FormValues = z.input<typeof schema>;

export default function TasksPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'dueAt', sortDir: 'asc' });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [comment, setComment] = useState('');

  const query = useQuery({
    queryKey: ['tasks', table.queryParams],
    queryFn: () => apiList<Task>('/tasks', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', 'selector'],
    queryFn: () => listClients<Client>('/clients', { pageSize: 200, sortBy: 'legalName', sortDir: 'asc' }),
    enabled: formOpen,
  });

  const detailQuery = useQuery({
    queryKey: ['task', detailId],
    queryFn: () => apiGet<Task>(`/tasks/${detailId}`),
    enabled: Boolean(detailId),
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
      title: editing?.title ?? '',
      description: editing?.description ?? '',
      priority: (editing?.priority as FormValues['priority']) ?? 'MEDIA',
      status: (editing?.status as FormValues['status']) ?? 'PENDIENTE',
      dueAt: toDateTimeInput(editing?.dueAt),
      assigneeId: editing?.assigneeId ?? '',
      clientId: editing?.clientId ?? '',
    });
  }, [formOpen, editing, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        dueAt: values.dueAt || null,
        assigneeId: values.assigneeId || undefined,
        clientId: values.clientId || null,
      };
      return editing ? apiPatch(`/tasks/${editing.id}`, payload) : apiPost('/tasks', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Tarea actualizada' : 'Tarea creada');
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setFormOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const complete = useMutation({
    mutationFn: (task: Task) => apiPatch(`/tasks/${task.id}`, { status: 'COMPLETADA' }),
    onSuccess: () => {
      toast.success('Tarea completada');
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (task: Task) => apiDelete(`/tasks/${task.id}`),
    onSuccess: () => {
      toast.success('Tarea eliminada');
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const addComment = useMutation({
    mutationFn: () => apiPost(`/tasks/${detailId}/comments`, { body: comment }),
    onSuccess: () => {
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['task', detailId] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns = useMemo<Array<Column<Task>>>(
    () => [
      {
        key: 'title',
        header: 'Tarea',
        sortKey: 'title',
        render: (row) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-slate-900">
              {row.isOverdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
              {row.title}
            </p>
            <p className="truncate text-xs text-slate-500">
              {row.clientName ?? 'Sin cliente'}
              {row.opportunityName ? ` · ${row.opportunityName}` : ''}
            </p>
          </div>
        ),
      },
      { key: 'priority', header: 'Prioridad', sortKey: 'priority', render: (row) => <StatusBadge value={row.priority} /> },
      {
        key: 'dueAt',
        header: 'Vence',
        sortKey: 'dueAt',
        render: (row) => (
          <span className={row.isOverdue ? 'font-medium text-red-600' : undefined}>{formatDateTime(row.dueAt)}</span>
        ),
      },
      { key: 'assignee', header: 'Responsable', hideOnMobile: true, render: (row) => row.assigneeName ?? '—' },
      { key: 'status', header: 'Estado', sortKey: 'status', render: (row) => <StatusBadge value={row.status} /> },
      {
        key: 'comments',
        header: 'Coment.',
        align: 'center',
        hideOnMobile: true,
        render: (row) => (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <MessageSquare className="h-3.5 w-3.5" />
            {row.commentsCount}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '128px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {can('tasks.update') && row.status !== 'COMPLETADA' && (
              <Button
                variant="ghost"
                size="icon"
                title="Completar"
                aria-label="Completar tarea"
                className="text-emerald-600 hover:bg-emerald-50"
                onClick={() => complete.mutate(row)}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            {can('tasks.update') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar tarea"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('tasks.delete') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar tarea"
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

  const task = detailQuery.data;

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Pendientes propios y asignados, con alertas de vencimiento."
        actions={
          <>
            {can('tasks.export') && <ExportMenu url="/tasks/export" params={table.queryParams} fileName="tareas" />}
            {can('tasks.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Nueva tarea
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por título o descripción…"
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
              label="Prioridad"
              value={table.state.filters.priority}
              onChange={(value) => table.setFilter('priority', value)}
              options={[
                { value: 'BAJA', label: 'Baja' },
                { value: 'MEDIA', label: 'Media' },
                { value: 'ALTA', label: 'Alta' },
                { value: 'URGENTE', label: 'Urgente' },
              ]}
            />
            <FilterSelect
              label="Vencidas"
              value={table.state.filters.overdue}
              onChange={(value) => table.setFilter('overdue', value)}
              options={[{ value: 'true', label: 'Solo vencidas' }]}
            />
            {can('tasks.delete') && (
              <FilterSelect
                label="Responsable"
                value={table.state.filters.assigneeId}
                onChange={(value) => table.setFilter('assigneeId', value)}
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
        onRowClick={(row) => setDetailId(row.id)}
        emptyTitle="Sin tareas"
        emptyMessage="Cree una tarea para dar seguimiento a sus pendientes."
        emptyAction={
          can('tasks.create') ? (
            <Button
              icon={<CheckSquare className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Crear tarea
            </Button>
          ) : undefined
        }
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar tarea' : 'Nueva tarea'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button form="task-form" type="submit" loading={save.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          id="task-form"
          onSubmit={handleSubmit((values) => save.mutate(values))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field label="Título" required error={errors.title?.message} className="sm:col-span-2">
            <Input {...register('title')} invalid={Boolean(errors.title)} />
          </Field>
          <Field label="Prioridad" required error={errors.priority?.message}>
            <Select {...register('priority')}>
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </Select>
          </Field>
          <Field label="Estado" required error={errors.status?.message}>
            <Select {...register('status')}>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_PROGRESO">En progreso</option>
              <option value="COMPLETADA">Completada</option>
              <option value="CANCELADA">Cancelada</option>
            </Select>
          </Field>
          <Field label="Fecha límite" error={errors.dueAt?.message}>
            <Input type="datetime-local" {...register('dueAt')} />
          </Field>
          <Field label="Responsable" error={errors.assigneeId?.message}>
            <Select {...register('assigneeId')}>
              <option value="">Yo</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cliente" error={errors.clientId?.message} className="sm:col-span-2">
            <Select {...register('clientId')}>
              <option value="">Sin cliente</option>
              {clientsQuery.data?.data.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legalName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción" error={errors.description?.message} className="sm:col-span-2">
            <Textarea rows={3} {...register('description')} />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(detailId)} onClose={() => setDetailId(null)} title={task?.title ?? 'Tarea'} size="md">
        {detailQuery.isLoading && <div className="skeleton h-24 w-full" />}
        {task && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={task.status} />
              <StatusBadge value={task.priority} />
              {task.isOverdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertTriangle className="h-3 w-3" /> Vencida
                </span>
              )}
            </div>
            {task.description && <p className="whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Vence</dt>
                <dd className="text-slate-700">{formatDateTime(task.dueAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Responsable</dt>
                <dd className="text-slate-700">{task.assigneeName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Cliente</dt>
                <dd className="text-slate-700">{task.clientName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Completada</dt>
                <dd className="text-slate-700">{formatDateTime(task.completedAt)}</dd>
              </div>
            </dl>

            <div className="border-t border-slate-200 pt-3">
              <p className="mb-2 text-sm font-medium text-slate-800">Comentarios</p>
              <ul className="mb-3 space-y-2">
                {task.comments?.map((item) => (
                  <li key={item.id} className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-sm text-slate-700">{item.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {item.authorName ?? 'Sistema'} · {formatDateTime(item.createdAt)}
                    </p>
                  </li>
                ))}
                {(task.comments?.length ?? 0) === 0 && (
                  <li className="text-sm text-slate-500">Sin comentarios todavía.</li>
                )}
              </ul>
              {can('tasks.update') && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (comment.trim()) addComment.mutate();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Escriba un comentario…"
                    maxLength={2000}
                  />
                  <Button type="submit" size="md" loading={addComment.isPending} disabled={!comment.trim()} icon={<Send className="h-4 w-4" />}>
                    Enviar
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar tarea"
        message={`¿Desea eliminar la tarea "${toDelete?.title ?? ''}"?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
