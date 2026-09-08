import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Contact2,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Permisos que habilitan el ítem (basta con uno). */
  permissions: string[];
  section: 'principal' | 'comercial' | 'operacion' | 'analisis' | 'administracion';
}

export const NAV_SECTIONS: Record<NavItem['section'], string> = {
  principal: 'Principal',
  comercial: 'Comercial',
  operacion: 'Operación',
  analisis: 'Análisis',
  administracion: 'Administración',
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permissions: ['dashboard.read'], section: 'principal' },

  { to: '/clientes', label: 'Clientes', icon: Building2, permissions: ['clients.read'], section: 'comercial' },
  { to: '/contactos', label: 'Contactos', icon: Contact2, permissions: ['contacts.read'], section: 'comercial' },
  { to: '/prospectos', label: 'Prospectos', icon: UserPlus, permissions: ['prospects.read'], section: 'comercial' },
  { to: '/oportunidades', label: 'Oportunidades', icon: Target, permissions: ['opportunities.read'], section: 'comercial' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, permissions: ['quotes.read'], section: 'comercial' },
  { to: '/ventas', label: 'Ventas', icon: Receipt, permissions: ['sales.read'], section: 'comercial' },
  { to: '/productos', label: 'Productos', icon: Package, permissions: ['products.read'], section: 'comercial' },

  { to: '/actividades', label: 'Actividades', icon: Activity, permissions: ['activities.read'], section: 'operacion' },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, permissions: ['activities.read'], section: 'operacion' },
  { to: '/tareas', label: 'Tareas', icon: CheckSquare, permissions: ['tasks.read'], section: 'operacion' },
  { to: '/documentos', label: 'Documentos', icon: ClipboardList, permissions: ['documents.read'], section: 'operacion' },

  { to: '/reportes', label: 'Reportes', icon: BarChart3, permissions: ['reports.read'], section: 'analisis' },

  { to: '/usuarios', label: 'Usuarios', icon: Users, permissions: ['users.read'], section: 'administracion' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, permissions: ['settings.read'], section: 'administracion' },
  { to: '/auditoria', label: 'Auditoría', icon: ShieldCheck, permissions: ['audit.read'], section: 'administracion' },
];
