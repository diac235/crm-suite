import { eq, sql } from 'drizzle-orm';
import { closeDatabase, db } from './index';
import {
  activityTypes,
  permissions,
  pipelineStages,
  prospectSources,
  rolePermissions,
  roles,
  sectors,
  settings,
  taxRates,
  users,
} from './schema';
import { ALL_PERMISSIONS, ROLE_PRESETS, SYSTEM_ROLES } from '../core/permissions';
import { hashPassword } from '../modules/auth/auth.service';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults';

async function seedPermissions(): Promise<Map<string, string>> {
  await db
    .insert(permissions)
    .values(ALL_PERMISSIONS)
    .onConflictDoUpdate({
      target: permissions.code,
      set: { description: sql`excluded.description` },
    });

  const rows = await db.select({ id: permissions.id, code: permissions.code }).from(permissions);
  return new Map(rows.map((r) => [r.code, r.id]));
}

async function seedRoles(permissionIds: Map<string, string>): Promise<Map<string, string>> {
  for (const [slug, preset] of Object.entries(ROLE_PRESETS)) {
    await db
      .insert(roles)
      .values({
        slug,
        name: preset.name,
        description: preset.description,
        level: preset.level,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.slug,
        set: { name: preset.name, description: preset.description, level: preset.level },
      });
  }

  const roleRows = await db.select({ id: roles.id, slug: roles.slug }).from(roles);
  const roleMap = new Map(roleRows.map((r) => [r.slug, r.id]));

  for (const [slug, preset] of Object.entries(ROLE_PRESETS)) {
    const roleId = roleMap.get(slug)!;
    // Se recalculan los permisos del rol para reflejar cambios del catálogo.
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    const values = preset.permissions
      .map((code) => permissionIds.get(code))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId, permissionId }));
    if (values.length > 0) {
      await db.insert(rolePermissions).values(values).onConflictDoNothing();
    }
  }

  return roleMap;
}

async function seedCatalogs(): Promise<void> {
  const sectorNames = [
    'Comercio',
    'Industria',
    'Servicios',
    'Tecnología',
    'Construcción',
    'Salud',
    'Educación',
    'Transporte y logística',
    'Agroindustria',
    'Sector público',
    'Financiero',
    'Turismo y hotelería',
  ];
  await db
    .insert(sectors)
    .values(sectorNames.map((name, i) => ({ name, order: i })))
    .onConflictDoNothing();

  const sources = [
    'Referido',
    'Sitio web',
    'Redes sociales',
    'Llamada en frío',
    'Feria o evento',
    'Campaña de correo',
    'WhatsApp',
    'Cliente existente',
    'Otro',
  ];
  await db
    .insert(prospectSources)
    .values(sources.map((name, i) => ({ name, order: i })))
    .onConflictDoNothing();

  const types = [
    { code: 'LLAMADA', name: 'Llamada', icon: 'phone', color: '#0ea5e9' },
    { code: 'REUNION', name: 'Reunión', icon: 'users', color: '#8b5cf6' },
    { code: 'CORREO', name: 'Correo', icon: 'mail', color: '#f59e0b' },
    { code: 'VISITA', name: 'Visita', icon: 'map-pin', color: '#10b981' },
    { code: 'WHATSAPP', name: 'WhatsApp', icon: 'message-circle', color: '#22c55e' },
    { code: 'TAREA', name: 'Tarea', icon: 'check-square', color: '#6366f1' },
    { code: 'SEGUIMIENTO', name: 'Seguimiento', icon: 'repeat', color: '#ec4899' },
    { code: 'OTRO', name: 'Otro', icon: 'circle', color: '#64748b' },
  ];
  await db
    .insert(activityTypes)
    .values(types.map((t, i) => ({ ...t, order: i })))
    .onConflictDoNothing();

  const stages = [
    { name: 'Nuevo', order: 0, probability: 10, color: '#64748b', isWon: false, isLost: false },
    { name: 'Calificación', order: 1, probability: 25, color: '#0ea5e9', isWon: false, isLost: false },
    { name: 'Contacto', order: 2, probability: 40, color: '#6366f1', isWon: false, isLost: false },
    { name: 'Propuesta', order: 3, probability: 60, color: '#8b5cf6', isWon: false, isLost: false },
    { name: 'Negociación', order: 4, probability: 80, color: '#f59e0b', isWon: false, isLost: false },
    { name: 'Ganada', order: 5, probability: 100, color: '#16a34a', isWon: true, isLost: false },
    { name: 'Perdida', order: 6, probability: 0, color: '#dc2626', isWon: false, isLost: true },
  ];
  await db.insert(pipelineStages).values(stages).onConflictDoNothing();

  await db
    .insert(taxRates)
    .values([
      { name: 'IVA 15%', rate: '15.000', isDefault: true },
      { name: 'IVA 0%', rate: '0.000', isDefault: false },
      { name: 'IVA 12%', rate: '12.000', isDefault: false },
    ])
    .onConflictDoNothing();

  for (const setting of DEFAULT_SETTINGS) {
    await db
      .insert(settings)
      .values({
        key: setting.key,
        value: JSON.stringify(setting.value),
        description: setting.description,
        isPublic: setting.isPublic,
      })
      .onConflictDoNothing();
  }
}

async function seedAdmin(roleMap: Map<string, string>): Promise<string> {
  const roleId = roleMap.get(SYSTEM_ROLES.SUPERADMIN)!;
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    logger.info(`Usuario administrador ya existe: ${email}`);
    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
      firstName: env.SEED_ADMIN_FIRST_NAME,
      lastName: env.SEED_ADMIN_LAST_NAME,
      roleId,
      isActive: true,
      // Obliga al cambio de contraseña en el primer ingreso.
      mustChangePassword: true,
    })
    .returning({ id: users.id });

  logger.info(`Usuario administrador creado: ${email}`);
  return created!.id;
}

export async function seed(): Promise<void> {
  logger.info('Ejecutando seed...');
  const permissionIds = await seedPermissions();
  const roleMap = await seedRoles(permissionIds);
  await seedCatalogs();
  const adminId = await seedAdmin(roleMap);

  if (env.SEED_DEMO_DATA) {
    const { seedDemoData } = await import('./seed-demo');
    await seedDemoData(adminId, roleMap);
  }

  logger.info('Seed finalizado');
}

if (require.main === module) {
  seed()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, 'Fallo el seed');
      await closeDatabase();
      process.exit(1);
    });
}
