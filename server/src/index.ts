import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

const db = openDatabase(config.DATABASE_PATH);
const applied = migrate(db);
if (applied.length > 0) logger.info({ applied }, 'migrations applied');
const seeded = seed(db);
if (seeded.branches || seeded.services) logger.info(seeded, 'reference data seeded');

const app = createApp({ config, db, logger });

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV, database: config.DATABASE_PATH }, 'server listening');
});

// Stop accepting connections, let in-flight requests finish, then close the DB.
// Docker sends SIGTERM on `docker stop`; we get ~10s before SIGKILL.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 8000).unref();

  server.close((err) => {
    db.close();
    clearTimeout(forceExit);
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  shutdown('unhandledRejection');
});
