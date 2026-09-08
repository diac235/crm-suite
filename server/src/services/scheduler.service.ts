import { env } from '../config/env';
import { logger } from '../config/logger';
import { purgeExpiredSessions } from '../modules/auth/auth.service';
import { refreshAutomaticNotifications } from './notification.service';

const NOTIFICATION_INTERVAL_MS = 5 * 60_000;
const CLEANUP_INTERVAL_MS = 6 * 3_600_000;

let notificationTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Tareas periódicas del proceso: notificaciones automáticas y limpieza.
 * Se ejecutan en el mismo proceso por simplicidad operativa; si en el futuro
 * se despliegan varias instancias, basta con moverlas a un worker dedicado.
 */
export function startScheduler(): void {
  if (env.isTest) return;

  void refreshAutomaticNotifications();
  notificationTimer = setInterval(() => {
    void refreshAutomaticNotifications();
  }, NOTIFICATION_INTERVAL_MS);
  notificationTimer.unref();

  cleanupTimer = setInterval(() => {
    void purgeExpiredSessions().catch((err) =>
      logger.error({ err }, 'Fallo al purgar sesiones caducadas'),
    );
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  logger.info('Planificador de tareas iniciado');
}

export function stopScheduler(): void {
  if (notificationTimer) clearInterval(notificationTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  notificationTimer = null;
  cleanupTimer = null;
}
