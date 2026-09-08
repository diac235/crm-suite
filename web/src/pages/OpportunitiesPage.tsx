import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { KanbanSquare, List, Pencil, Plus, Target } from 'lucide-react';
import { apiGet, apiList, errorMessage } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useCatalogs, useUserOptions } from '../hooks/useCatalogs';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { StatusBadge } from '../components/ui/Badge';
import { ErrorState, Spinner } from '../components/ui/Spinner';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import { ExportMenu } from '../components/ExportMenu';
import { PipelineBoard } from '../features/opportunities/PipelineBoard';
import { OpportunityFormModal } from '../features/opportunities/OpportunityFormModal';
import { MoveStageModal } from '../features/opportunities/MoveStageModal';
import { cn } from '../lib/utils';
import type { BoardColumn, Opportunity } from '../types';

type View = 'pipeline' | 'lista';

export default function OpportunitiesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const table = useTableState({ sortBy: 'createdAt', sortDir: 'desc' });

  const [view, setView] = useState<View>('pipeline');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [moving, setMoving] = useState<{ opportunity: Opportunity; stageId?: string } | null>(null);

  const boardQuery = useQuery({
    queryKey: ['opportunities', 'board', table.queryParams],
    queryFn: () => apiGet<BoardColumn[]>('/opportunities/board', table.queryParams),
    enabled: view === 'pipeline',
  });

  const listQuery = useQuery({
    queryKey: ['opportunities', 'list', table.queryParams],
    queryFn: () => apiList<Opportunity>('/opportunities', table.queryParams),
    enabled: view === 'lista',
    placeholderData: (previous) => previous,
  });

  const columns = useMemo<Array<Column<Opportunity>>>(
    () => [
      {
        key: 'name',
        header: 'Oportunidad',
        sortKey: 'name',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.name}</p>
            <p className="truncate text-xs text-slate-500">
              {row.code} · {row.clientName ?? 'Sin cliente'}
            </p>
          </div>
        ),
      },
      {
        key: 'stage',
        header: 'Etapa',
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: row.stageColor }} aria-hidden />
            {row.stageName}
          </span>
        ),
      },
      { key: 'amount', header: 'Valor', sortKey: 'amount', align: 'right', render: (row) => formatMoney(row.amount) },
      {
        key: 'probability',
        header: 'Prob.',
        sortKey: 'probability',
        align: 'right',
        hideOnMobile: true,
        render: (row) => `${row.probability}%`,
      },
      { key: 'owner', header: 'Responsable', hideOnMobile: true, render: (row) => row.ownerName ?? 'Sin asignar' },
      {
        key: 'expectedCloseAt',
        header: 'Cierre estimado',
        sortKey: 'expectedCloseAt',
        hideOnMobile: true,
        render: (row) => formatDate(row.expectedCloseAt),
      },
      { key: 'status', header: 'Estado', sortKey: 'status', render: (row) => <StatusBadge value={row.status} /> },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '64px',
        render: (row) =>
          can('opportunities.update') ? (
            <div onClick={(event) => event.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar oportunidad"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [can],
  );

  const error = view === 'pipeline' ? boardQuery.error : listQuery.error;
  if (error) {
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => (view === 'pipeline' ? boardQuery.refetch() : listQuery.refetch())}
      />
    );
  }

  const totalPipeline = (boardQuery.data ?? []).reduce((acc, column) => acc + Number(column.total), 0);

  return (
    <>
      <PageHeader
        title="Oportunidades"
        description={
          view === 'pipeline' ? `Valor total del pipeline visible: ${formatMoney(totalPipeline)}` : 'Listado completo de oportunidades.'
        }
        actions={
          <>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setView('pipeline')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  view === 'pipeline' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <KanbanSquare className="h-4 w-4" />
                Pipeline
              </button>
              <button
                type="button"
                onClick={() => setView('lista')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  view === 'lista' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <List className="h-4 w-4" />
                Lista
              </button>
            </div>
            {can('opportunities.export') && (
              <ExportMenu url="/opportunities/export" params={table.queryParams} fileName="oportunidades" />
            )}
            {can('opportunities.create') && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Nueva oportunidad
              </Button>
            )}
          </>
        }
      />

      <ResourceToolbar
        search={table.state.search}
        onSearchChange={table.setSearch}
        placeholder="Buscar por nombre, código o cliente…"
        activeFilterCount={table.activeFilterCount}
        onResetFilters={table.resetFilters}
        filters={
          <>
            {view === 'lista' && (
              <>
                <FilterSelect
                  label="Estado"
                  value={table.state.filters.status}
                  onChange={(value) => table.setFilter('status', value)}
                  options={[
                    { value: 'ABIERTA', label: 'Abierta' },
                    { value: 'GANADA', label: 'Ganada' },
                    { value: 'PERDIDA', label: 'Perdida' },
                    { value: 'CANCELADA', label: 'Cancelada' },
                  ]}
                />
                <FilterSelect
                  label="Etapa"
                  value={table.state.filters.stageId}
                  onChange={(value) => table.setFilter('stageId', value)}
                  options={(catalogs?.pipelineStages ?? []).map((stage) => ({ value: stage.id, label: stage.name }))}
                />
              </>
            )}
            {can('opportunities.delete') && (
              <FilterSelect
                label="Responsable"
                value={table.state.filters.ownerId}
                onChange={(value) => table.setFilter('ownerId', value)}
                options={(users ?? []).map((user) => ({ value: user.id, label: user.label }))}
              />
            )}
            <FilterSelect
              label="Fuente"
              value={table.state.filters.sourceId}
              onChange={(value) => table.setFilter('sourceId', value)}
              options={(catalogs?.prospectSources ?? []).map((source) => ({ value: source.id, label: source.name }))}
            />
          </>
        }
      />

      {view === 'pipeline' ? (
        boardQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <PipelineBoard
            columns={boardQuery.data ?? []}
            canMove={can('opportunities.update')}
            onRequestMove={(opportunity, stageId) => setMoving({ opportunity, stageId })}
          />
        )
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={listQuery.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={listQuery.isLoading}
            sortBy={table.state.sortBy}
            sortDir={table.state.sortDir}
            onSort={table.toggleSort}
            onRowClick={(row) => navigate(`/oportunidades/${row.id}`)}
            emptyTitle="Sin oportunidades"
            emptyMessage="Cree una oportunidad para comenzar a alimentar el pipeline."
            emptyAction={
              can('opportunities.create') ? (
                <Button
                  icon={<Target className="h-4 w-4" />}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Crear oportunidad
                </Button>
              ) : undefined
            }
          />
          <Pagination meta={listQuery.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
        </>
      )}

      <OpportunityFormModal open={formOpen} onClose={() => setFormOpen(false)} opportunity={editing} />
      {moving && (
        <MoveStageModal
          opportunity={moving.opportunity}
          targetStageId={moving.stageId}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
}
