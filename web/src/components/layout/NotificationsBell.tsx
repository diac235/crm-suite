import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { apiPost, http } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { Notification } from '../../types';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: async () => {
      const res = await http.get<{ data: Notification[]; meta: { unread: number } }>('/notifications', {
        params: { pageSize: 12 },
      });
      return res.data;
    },
    // Refresco periódico para que los avisos lleguen sin recargar la página.
    refetchInterval: 60_000,
  });

  const unread = data?.meta.unread ?? 0;

  const markAll = useMutation({
    mutationFn: () => apiPost('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => apiPost('/notifications/read', { ids: [id] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ''}`}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notificaciones</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todo como leído
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.data.length ?? 0) === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No tiene notificaciones.</p>
            )}
            {data?.data.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  markOne.mutate(notification.id);
                  setOpen(false);
                  if (notification.link) navigate(notification.link);
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50',
                  !notification.readAt && 'bg-brand-50/40',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{notification.title}</span>
                  {!notification.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                </span>
                {notification.body && (
                  <span className="line-clamp-2 text-xs text-slate-500">{notification.body}</span>
                )}
                <span className="text-[11px] text-slate-400">{formatRelative(notification.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
