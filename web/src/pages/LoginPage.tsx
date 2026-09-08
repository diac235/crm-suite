import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { errorMessage } from '../lib/api';
import { FullPageSpinner } from '../components/ui/Spinner';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullPageSpinner message="Cargando…" />;
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Panel lateral informativo, oculto en pantallas pequeñas */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-sm font-bold">
            CRM
          </span>
          <span className="text-lg font-semibold">CRM Suite</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">
            Toda su operación comercial
            <br />
            en un solo lugar
          </h1>
          <p className="mt-4 max-w-md text-white/80">
            Clientes, prospectos, pipeline de oportunidades, cotizaciones, actividades y reportes.
            Con trazabilidad completa de cada interacción.
          </p>
        </div>
        <p className="text-sm text-white/60">© {new Date().getFullYear()} CRM Suite</p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              CRM
            </span>
            <span className="text-lg font-semibold text-slate-900">CRM Suite</span>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-slate-500">Ingrese sus credenciales para continuar.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="label" htmlFor="email">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input-base pl-9"
                  placeholder="usuario@empresa.com"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input-base pl-9 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={submitting}>
              Ingresar
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            El acceso queda registrado en la bitácora de auditoría del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
