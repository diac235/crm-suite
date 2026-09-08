import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDatabase, db } from './index';
import { logger } from '../config/logger';

/** Aplica todas las migraciones pendientes de la carpeta ./drizzle. */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      logger.info('Migraciones aplicadas correctamente');
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, 'Fallo al aplicar migraciones');
      await closeDatabase();
      process.exit(1);
    });
}
