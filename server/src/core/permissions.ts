/**
 * Catálogo central de permisos.
 * Cada permiso se identifica con el código `modulo.accion`.
 * Añadir un módulo nuevo solo requiere extender este archivo y re-ejecutar el seed.
 */

export const MODULES = {
  dashboard: 'Dashboard',
  clients: 'Clientes',
  contacts: 'Contactos',
  prospects: 'Prospectos',
  opportunities: 'Oportunidades',
  quotes: 'Cotizaciones',
  sales: 'Ventas',
  products: 'Productos',
  activities: 'Actividades',
  tasks: 'Tareas',
  documents: 'Documentos',
  notes: 'Notas',
  reports: 'Reportes',
  users: 'Usuarios',
  roles: 'Roles y permisos',
  teams: 'Equipos',
  settings: 'Configuración',
  audit: 'Auditoría',
  notifications: 'Notificaciones',
} as const;

export type ModuleKey = keyof typeof MODULES;

export const ACTIONS = {
  read: 'Consultar',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
  manage: 'Administrar',
} as const;

export type ActionKey = keyof typeof ACTIONS;

/** Acciones habilitadas por módulo. */
const MODULE_ACTIONS: Record<ModuleKey, ActionKey[]> = {
  dashboard: ['read'],
  clients: ['read', 'create', 'update', 'delete', 'export'],
  contacts: ['read', 'create', 'update', 'delete', 'export'],
  prospects: ['read', 'create', 'update', 'delete', 'export'],
  opportunities: ['read', 'create', 'update', 'delete', 'export'],
  quotes: ['read', 'create', 'update', 'delete', 'export'],
  sales: ['read', 'create', 'update', 'delete', 'export'],
  products: ['read', 'create', 'update', 'delete', 'export'],
  activities: ['read', 'create', 'update', 'delete', 'export'],
  tasks: ['read', 'create', 'update', 'delete', 'export'],
  documents: ['read', 'create', 'delete'],
  notes: ['read', 'create', 'update', 'delete'],
  reports: ['read', 'export'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'manage'],
  teams: ['read', 'create', 'update', 'delete'],
  settings: ['read', 'manage'],
  audit: ['read', 'export'],
  notifications: ['read', 'update'],
};

export interface PermissionDefinition {
  code: string;
  module: ModuleKey;
  action: ActionKey;
  description: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = (
  Object.keys(MODULE_ACTIONS) as ModuleKey[]
).flatMap((module) =>
  MODULE_ACTIONS[module].map((action) => ({
    code: `${module}.${action}`,
    module,
    action,
    description: `${ACTIONS[action]} en ${MODULES[module]}`,
  })),
);

export const ALL_PERMISSION_CODES = ALL_PERMISSIONS.map((p) => p.code);

/** Roles del sistema creados por el seed. */
export const SYSTEM_ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USUARIO: 'usuario',
} as const;

export const ROLE_PRESETS: Record<
  string,
  { name: string; description: string; level: number; permissions: string[] }
> = {
  [SYSTEM_ROLES.SUPERADMIN]: {
    name: 'Superadministrador',
    description: 'Acceso total al sistema, incluida la configuración y la auditoría.',
    level: 0,
    permissions: ALL_PERMISSION_CODES,
  },
  [SYSTEM_ROLES.ADMIN]: {
    name: 'Administrador',
    description: 'Gestiona la operación comercial completa sin tocar la configuración crítica.',
    level: 10,
    permissions: ALL_PERMISSION_CODES.filter(
      (code) =>
        !code.startsWith('roles.') &&
        !code.startsWith('settings.manage') &&
        code !== 'users.delete',
    ),
  },
  [SYSTEM_ROLES.USUARIO]: {
    name: 'Usuario',
    description: 'Ejecutivo comercial: trabaja su propia cartera.',
    level: 50,
    permissions: [
      'dashboard.read',
      'clients.read',
      'clients.create',
      'clients.update',
      'clients.export',
      'contacts.read',
      'contacts.create',
      'contacts.update',
      'prospects.read',
      'prospects.create',
      'prospects.update',
      'prospects.export',
      'opportunities.read',
      'opportunities.create',
      'opportunities.update',
      'opportunities.export',
      'quotes.read',
      'quotes.create',
      'quotes.update',
      'quotes.export',
      'sales.read',
      'products.read',
      'activities.read',
      'activities.create',
      'activities.update',
      'tasks.read',
      'tasks.create',
      'tasks.update',
      'documents.read',
      'documents.create',
      'notes.read',
      'notes.create',
      'notes.update',
      'reports.read',
      'notifications.read',
      'notifications.update',
    ],
  },
};
