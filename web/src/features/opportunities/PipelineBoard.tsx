import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Building2, GripVertical, User } from 'lucide-react';
import { formatDate, formatMoney } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { BoardColumn, Opportunity } from '../../types';

function OpportunityCard({ opportunity, dragging }: { opportunity: Opportunity; dragging?: boolean }) {
  return (
    <article
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition',
        dragging && 'rotate-1 shadow-lg ring-2 ring-brand-400',
      )}
    >
      <p className="line-clamp-2 text-sm font-medium text-slate-900">{opportunity.name}</p>
      <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
        <Building2 className="h-3 w-3 shrink-0" />
        {opportunity.clientName ?? 'Sin cliente'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{formatMoney(opportunity.amount)}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {opportunity.probability}%
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1 truncate">
          <User className="h-3 w-3 shrink-0" />
          {opportunity.ownerName ?? 'Sin asignar'}
        </span>
        {opportunity.expectedCloseAt && <span className="shrink-0">{formatDate(opportunity.expectedCloseAt)}</span>}
      </div>
    </article>
  );
}

function DraggableCard({
  opportunity,
  onOpen,
  disabled,
}: {
  opportunity: Opportunity;
  onOpen: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    data: { opportunity },
    disabled,
  });

  return (
    <div ref={setNodeRef} className={cn('relative', isDragging && 'opacity-40')}>
      {!disabled && (
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Arrastrar ${opportunity.name}`}
          className="absolute right-1 top-1 z-10 cursor-grab rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <OpportunityCard opportunity={opportunity} />
      </button>
    </div>
  );
}

function Column({ column, children }: { column: BoardColumn; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-slate-100/60 transition',
        isOver ? 'border-brand-400 bg-brand-50' : 'border-slate-200',
      )}
    >
      <header className="border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: column.stage.color }} aria-hidden />
            <span className="truncate text-sm font-semibold text-slate-800">{column.stage.name}</span>
          </span>
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
            {column.count}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatMoney(column.total)} · ponderado {formatMoney(column.weighted)}
        </p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        {children}
        {column.count === 0 && (
          <p className="px-2 py-6 text-center text-xs text-slate-400">Arrastre oportunidades aquí</p>
        )}
      </div>
    </section>
  );
}

/** Pipeline tipo Kanban con arrastre entre etapas. */
export function PipelineBoard({
  columns,
  canMove,
  onRequestMove,
}: {
  columns: BoardColumn[];
  canMove: boolean;
  onRequestMove: (opportunity: Opportunity, stageId: string) => void;
}) {
  const navigate = useNavigate();
  const [active, setActive] = useState<Opportunity | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current as { opportunity: Opportunity } | undefined)?.opportunity ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const opportunity = (event.active.data.current as { opportunity: Opportunity } | undefined)?.opportunity;
    const targetStageId = event.over?.id ? String(event.over.id) : null;
    if (!opportunity || !targetStageId || opportunity.stageId === targetStageId) return;
    onRequestMove(opportunity, targetStageId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => (
          <Column key={column.stage.id} column={column}>
            {column.items.map((opportunity) => (
              <DraggableCard
                key={opportunity.id}
                opportunity={opportunity}
                disabled={!canMove}
                onOpen={() => navigate(`/oportunidades/${opportunity.id}`)}
              />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay>{active ? <OpportunityCard opportunity={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
