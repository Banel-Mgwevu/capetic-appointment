import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { createLogger } from './logger.js';
import { AppointmentRepository } from './repositories/appointmentRepository.js';
import { BranchRepository } from './repositories/branchRepository.js';
import { NotificationRepository } from './repositories/notificationRepository.js';
import { ServiceRepository } from './repositories/serviceRepository.js';
import { StaffUserRepository } from './repositories/staffUserRepository.js';
import { JobLockRepository } from './repositories/jobLockRepository.js';
import { ReminderService } from './services/reminderService.js';
import { RetentionService } from './services/retentionService.js';
import { bootstrapStaffUsers } from './services/staffBootstrap.js';
import { SimulatedNotifier } from './services/notifications/simulatedNotifier.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

const db = openDatabase(config.DATABASE_PATH);
const applied = migrate(db);
if (applied.length > 0) logger.info({ applied }, 'migrations applied');
const seeded = seed(db);
if (seeded.branches || seeded.services) logger.info(seeded, 'reference data seeded');

await bootstrapStaffUsers(new StaffUserRepository(db), config, logger);

const app = createApp({ config, db, logger });

// Background jobs share the same database and a small set of repositories,
// built separately from the ones inside createApp so the HTTP composition
// root stays free of anything that isn't request-scoped.
const branches = new BranchRepository(db);
const services = new ServiceRepository(db);
const appointments = new AppointmentRepository(db);
const notifications = new NotificationRepository(db);
const notifier = new SimulatedNotifier(notifications, logger);
const jobLocks = new JobLockRepository(db);

const retention = new RetentionService({
  appointments,
  locks: jobLocks,
  retentionDays: config.DATA_RETENTION_DAYS,
  logger,
  clock: () => new Date(),
});
const reminder = new ReminderService({ appointments, branches, services, locks: jobLocks, notifier, logger, clock: () => new Date() });

const timers: NodeJS.Timeout[] = [];
if (config.RETENTION_CHECK_INTERVAL_HOURS > 0) {
  const intervalMs = config.RETENTION_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
  timers.push(setInterval(() => retention.sweep(), intervalMs).unref());
  retention.sweep(); // also run once at startup, so a long-lived deployment doesn't wait a full interval
}
if (config.REMINDER_CHECK_INTERVAL_MINUTES > 0) {
  const intervalMs = config.REMINDER_CHECK_INTERVAL_MINUTES * 60 * 1000;
  timers.push(setInterval(() => void reminder.sweep(), intervalMs).unref());
  void reminder.sweep();
}

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

  for (const timer of timers) clearInterval(timer);

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
