import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { apiGet, apiList, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useUserOptions } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { StatCard } from '../components/ui/StatCard';
import { ErrorState } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import { ExportMenu } from '../components/ExportMenu';
import type { AuditEntry } from '../types';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  RESTORE: 'Restauración',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Intento fallido',
  EXPORT: 'Exportación',
  DOWNLOAD: 'Descarga',
  STATUS_CHANGE: 'Cambio de estado',
  CONVERT: 'Conversión',
};

const ACTION_TONES: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'neutral'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  LOGIN_FAILED: 'danger',
  EXPORT: 'warning',
  DOWNLOAD: 'warning',
  STATUS_CHANGE: 'info',
  CONVERT: 'success',
};

export default function AuditPage() {
  const { can } = useAuth();
  const { data: users } = useUserOptions();
  const table = useTableState({ pageSize: 50 });
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const query = useQuery({
    queryKey: ['audit', table.queryParams],
    queryFn: () => apiList<AuditEntry>('/audit', table.queryParams),
    placeholderData: (previous) => previous,
  });

  const statsQuery = useQuery({
    queryKey: ['audit', 'stats'],
    queryFn: () => apiGet<{ byAction: Array<{ action: string; total: number }>; byUser: Array<{ userEmail: string; total: number }> }>('/audit/stats'),
  });

  const columns = useMemo<Array<Column<AuditEntry>>>(
    () => [
      { key: 'createdAt', header: 'Fecha y hora', render: (row) => formatDateTime(row.createdAt) },
      {
        key: 'user',
        header: 'Usuario',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-slate-800">{row.userName ?? 'Sistema'}</p>
            <p className="truncate text-xs text-slate-500">{row.userEmail ?? '—'}</p>
          </div>
        ),
      },
      {
        key: 'action',
        header: 'Acción',
        render: (row) => <Badge tone={ACTION_TONES[row.action] ?? 'neutral'}>{ACTION_LABELS[row.action] ?? row.action}</Badge>,
      },
      { key: 'module', header: 'Módulo', hideOnMobile: true, render: (row) => row.module },
      { key: 'entity', header: 'Registro', render: (row) => row.entityLabel ?? row.entityType },
      { key: 'ip', header: 'IP', hideOnMobile: true, render: (row) => row.ipAddress ?? '—' },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '56px',
        render: (row) => (
          <Button variant="ghost" size="icon" aria-label="Ver detalle" onClick={() => setSelected(row)}>
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [],
  );

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro de todas las acciones realizadas en el sistema."
        actions={can('audit.export') ? <ExportMenu url="/audit/export" params={table.queryParams} fileName="auditoria" /> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(statsQuery.data?.byAction ?? []).slice(0, 4).map((item) => (
          <StatCard key={item.action} label={ACTION_LABELS[item.action] ?? item.action} value={item.total} tone="neutral" hint="últimos 30 días" />
        ))}
      </div>

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por registro o correo…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            <FilterSelect
              label="Acción"
              value={table.state.filters.action}
              onChange={(value) => table.setFilter('action', value)}
              options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <FilterSelect
              label="Entidad"
              value={table.state.filters.entityType}
              onChange={(value) => table.setFilter('entityType', value)}
              options={[
                'CLIENT', 'CONTACT', 'PROSPECT', 'OPPORTUNITY', 'QUOTE', 'SALE',
                'ACTIVITY', 'TASK', 'DOCUMENT', 'NOTE', 'USER', 'ROLE', 'PRODUCT', 'SETTING', 'TEAM', 'CATALOG',
              ].map((value) => ({ value, label: value }))}
            />
            <FilterSelect
              label="Usuario"
              value={table.state.filters.userId}
              onChange={(value) => table.setFilter('userId', value)}
              options={(users ?? []).map((user) => ({ value: user.id, label: user.label }))}
            />
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        emptyTitle="Sin registros de auditoría"
        emptyMessage="Todavía no se han registrado acciones con los filtros aplicados."
      />

      <Pagination meta={query.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Detalle del evento"
        description={selected ? `${ACTION_LABELS[selected.action] ?? selected.action} · ${formatDateTime(selected.createdAt)}` : undefined}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-slate-400">Usuario</dt>
                <dd className="text-slate-800">{selected.userName ?? 'Sistema'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Correo</dt>
                <dd className="text-slate-800">{selected.userEmail ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Módulo</dt>
                <dd className="text-slate-800">{selected.module}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Entidad</dt>
                <dd className="text-slate-800">{selected.entityType}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-400">Registro</dt>
                <dd className="text-slate-800">{selected.entityLabel ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Dirección IP</dt>
                <dd className="text-slate-800">{selected.ipAddress ?? '—'}</dd>
              </div>
            </dl>

            {selected.before && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Datos anteriores</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(selected.before, null, 2)}
                </pre>
              </div>
            )}
            {selected.after && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Datos nuevos</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(selected.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
