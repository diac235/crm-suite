import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/** Bloquea el acceso a una página cuando faltan permisos. */
export function RequirePermission({ codes, children }: { codes: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (can(...codes)) return <>{children}</>;
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Acceso restringido</h2>
      <p className="mt-1 text-sm text-slate-500">
        Su rol no tiene permisos para ver esta sección. Solicite acceso al administrador del sistema.
      </p>
    </div>
  );
}
