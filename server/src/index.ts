import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { checkDatabaseConnection, closeDatabase } from './db';
import { runMigrations } from './db/migrate';
import { seed } from './db/seed';
import { ensureStorageDir } from './middlewares/upload';
import { startScheduler, stopScheduler } from './services/scheduler.service';

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection();
  ensureStorageDir();

  // Preparación automática de la base para despliegues sin terminal
  // (Cloud Run, Render). Ambas operaciones son idempotentes.
  if (env.RUN_MIGRATIONS_ON_START) {
    logger.info('Aplicando migraciones pendientes...');
    await runMigrations();
    logger.info('Migraciones al día');
  }
  if (env.RUN_SEED_ON_START) {
    logger.info('Ejecutando datos iniciales...');
    await seed();
  }

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(`API del CRM escuchando en http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  startScheduler();

  const shutdown = (signal: string) => {
    logger.info(`Recibida señal ${signal}, cerrando de forma ordenada...`);
    stopScheduler();
    server.close(async () => {
      await closeDatabase();
      logger.info('Servidor detenido');
      process.exit(0);
    });
    // Cierre forzado si algo queda colgado.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Promesa rechazada sin manejar');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Excepción no capturada');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
