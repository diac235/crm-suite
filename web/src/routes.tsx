import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequirePermission } from './components/RequirePermission';
import { FullPageSpinner } from './components/ui/Spinner';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const ProspectsPage = lazy(() => import('./pages/ProspectsPage'));
const OpportunitiesPage = lazy(() => import('./pages/OpportunitiesPage'));
const OpportunityDetailPage = lazy(() => import('./pages/OpportunityDetailPage'));
const QuotesPage = lazy(() => import('./pages/QuotesPage'));
const QuoteFormPage = lazy(() => import('./pages/QuoteFormPage'));
const QuoteDetailPage = lazy(() => import('./pages/QuoteDetailPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ActivitiesPage = lazy(() => import('./pages/ActivitiesPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner message="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function Page({ codes, children }: { codes: string[]; children: ReactNode }) {
  return (
    <RequirePermission codes={codes}>
      <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
    </RequirePermission>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <Protected>
        <AppLayout />
      </Protected>
    ),
    children: [
      { index: true, element: <Page codes={['dashboard.read']}><DashboardPage /></Page> },
      { path: 'clientes', element: <Page codes={['clients.read']}><ClientsPage /></Page> },
      { path: 'clientes/:id', element: <Page codes={['clients.read']}><ClientDetailPage /></Page> },
      { path: 'contactos', element: <Page codes={['contacts.read']}><ContactsPage /></Page> },
      { path: 'prospectos', element: <Page codes={['prospects.read']}><ProspectsPage /></Page> },
      { path: 'prospectos/:id', element: <Page codes={['prospects.read']}><ProspectsPage /></Page> },
      { path: 'oportunidades', element: <Page codes={['opportunities.read']}><OpportunitiesPage /></Page> },
      { path: 'oportunidades/:id', element: <Page codes={['opportunities.read']}><OpportunityDetailPage /></Page> },
      { path: 'cotizaciones', element: <Page codes={['quotes.read']}><QuotesPage /></Page> },
      { path: 'cotizaciones/nueva', element: <Page codes={['quotes.create']}><QuoteFormPage /></Page> },
      { path: 'cotizaciones/:id', element: <Page codes={['quotes.read']}><QuoteDetailPage /></Page> },
      { path: 'cotizaciones/:id/editar', element: <Page codes={['quotes.update']}><QuoteFormPage /></Page> },
      { path: 'ventas', element: <Page codes={['sales.read']}><SalesPage /></Page> },
      { path: 'productos', element: <Page codes={['products.read']}><ProductsPage /></Page> },
      { path: 'actividades', element: <Page codes={['activities.read']}><ActivitiesPage /></Page> },
      { path: 'actividades/:id', element: <Page codes={['activities.read']}><ActivitiesPage /></Page> },
      { path: 'calendario', element: <Page codes={['activities.read']}><CalendarPage /></Page> },
      { path: 'tareas', element: <Page codes={['tasks.read']}><TasksPage /></Page> },
      { path: 'documentos', element: <Page codes={['documents.read']}><DocumentsPage /></Page> },
      { path: 'reportes', element: <Page codes={['reports.read']}><ReportsPage /></Page> },
      { path: 'usuarios', element: <Page codes={['users.read']}><UsersPage /></Page> },
      { path: 'configuracion', element: <Page codes={['settings.read']}><SettingsPage /></Page> },
      { path: 'auditoria', element: <Page codes={['audit.read']}><AuditPage /></Page> },
      { path: 'perfil', element: <Suspense fallback={<FullPageSpinner />}><ProfilePage /></Suspense> },
      { path: '*', element: <Suspense fallback={<FullPageSpinner />}><NotFoundPage /></Suspense> },
    ],
  },
]);
