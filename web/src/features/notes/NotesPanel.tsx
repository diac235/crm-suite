import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiList, apiPatch, apiPost, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';
import type { Note } from '../../types';

type Scope = { clientId: string } | { prospectId: string } | { opportunityId: string };

export function NotesPanel({ scope }: { scope: Scope }) {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const [body, setBody] = useState('');
  const [toDelete, setToDelete] = useState<Note | null>(null);

  const query = useQuery({
    queryKey: ['notes', scope],
    queryFn: () => apiList<Note>('/notes', { ...scope, pageSize: 100 }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notes', scope] });

  const create = useMutation({
    mutationFn: () => apiPost('/notes', { ...scope, body }),
    onSuccess: () => {
      setBody('');
      void invalidate();
      toast.success('Nota agregada');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const togglePin = useMutation({
    mutationFn: (note: Note) => apiPatch(`/notes/${note.id}`, { isPinned: !note.isPinned }),
    onSuccess: () => void invalidate(),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (note: Note) => apiDelete(`/notes/${note.id}`),
    onSuccess: () => {
      void invalidate();
      setToDelete(null);
      toast.success('Nota eliminada');
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  return (
    <div className="space-y-4">
      {can('notes.create') && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) create.mutate();
          }}
          className="space-y-2"
        >
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Escriba una nota sobre este registro…"
            rows={3}
            maxLength={4000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{body.length}/4000</span>
            <Button type="submit" size="sm" icon={<Send className="h-4 w-4" />} loading={create.isPending} disabled={!body.trim()}>
              Agregar nota
            </Button>
          </div>
        </form>
      )}

      {query.isLoading && <div className="skeleton h-20 w-full" />}

      {!query.isLoading && (query.data?.data.length ?? 0) === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">Todavía no hay notas registradas.</p>
      )}

      <ul className="space-y-2">
        {query.data?.data.map((note) => (
          <li
            key={note.id}
            className={cn(
              'rounded-lg border p-3',
              note.isPinned ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white',
            )}
          >
            <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                {note.authorName ?? 'Sistema'} · {formatDateTime(note.createdAt)}
              </p>
              <div className="flex items-center gap-1">
                {can('notes.update') && (
                  <button
                    type="button"
                    onClick={() => togglePin.mutate(note)}
                    title={note.isPinned ? 'Quitar fijado' : 'Fijar nota'}
                    aria-label={note.isPinned ? 'Quitar fijado' : 'Fijar nota'}
                    className={cn('rounded p-1 transition hover:bg-slate-100', note.isPinned ? 'text-amber-600' : 'text-slate-400')}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                )}
                {(note.authorId === user?.id || can('notes.delete')) && (
                  <button
                    type="button"
                    onClick={() => setToDelete(note)}
                    title="Eliminar nota"
                    aria-label="Eliminar nota"
                    className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar nota"
        message="Esta acción no se puede deshacer. ¿Desea continuar?"
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
