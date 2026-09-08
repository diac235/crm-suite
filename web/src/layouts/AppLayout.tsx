import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from '../components/layout/navigation';
import { GlobalSearch } from '../components/layout/GlobalSearch';
import { NotificationsBell } from '../components/layout/NotificationsBell';
import { cn, initials } from '../lib/utils';

export function AppLayout() {
  const { user, logout, can, mustChangePassword } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Al navegar en móvil se cierra el menú lateral.
  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Si el usuario debe cambiar su contraseña se le conduce a su perfil
  // antes de permitirle operar el resto del sistema.
  useEffect(() => {
    if (mustChangePassword && location.pathname !== '/perfil') {
      navigate('/perfil', { replace: true });
    }
  }, [mustChangePassword, location.pathname, navigate]);

  const visibleItems = NAV_ITEMS.filter((item) => can(...item.permissions));
  const sections = Object.keys(NAV_SECTIONS) as Array<NavItem['section']>;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Fondo oscuro del menú en móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              CRM
            </span>
            <span className="text-sm font-semibold text-slate-900">CRM Suite</span>
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => {
            const items = visibleItems.filter((item) => item.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-5 last:mb-0">
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {NAV_SECTIONS[section]}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                            isActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                          )
                        }
                      >
                        <item.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <p className="px-2 text-[11px] text-slate-400">
            Sesión: <span className="font-medium text-slate-600">{user?.roleSlug}</span>
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>

          <NotificationsBell />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex items-center gap-2 rounded-lg p-1.5 pr-2 transition hover:bg-slate-100"
              aria-label="Menú de usuario"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {initials(`${user?.firstName ?? ''} ${user?.lastName ?? ''}`)}
              </span>
              <span className="hidden text-sm font-medium text-slate-700 sm:block">
                {user?.firstName}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/perfil')}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <UserIcon className="h-4 w-4" />
                    Mi perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
