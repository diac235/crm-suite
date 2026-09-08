import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-10 text-center">
      <Compass className="mx-auto h-10 w-10 text-slate-300" />
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">Página no encontrada</h1>
      <p className="mt-1 text-sm text-slate-500">
        La dirección que intenta abrir no existe o fue movida.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Volver al dashboard
      </Link>
    </div>
  );
}
