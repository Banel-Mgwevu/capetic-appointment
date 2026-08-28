import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Config } from './config.js';
import type { Db } from './db/connection.js';
import type { Logger } from './logger.js';
import { AnalyticsRepository } from './repositories/analyticsRepository.js';
import { AppointmentRepository } from './repositories/appointmentRepository.js';
import { AuditLogRepository } from './repositories/auditLogRepository.js';
import { OtpRepository } from './repositories/otpRepository.js';
import { StaffUserRepository } from './repositories/staffUserRepository.js';
import { JobLockRepository } from './repositories/jobLockRepository.js';
import { BranchRepository } from './repositories/branchRepository.js';
import { NotificationRepository } from './repositories/notificationRepository.js';
import { ServiceRepository } from './repositories/serviceRepository.js';
import { AnalyticsService } from './services/analyticsService.js';
import { AppointmentService } from './services/appointmentService.js';
import { AuthService } from './services/authService.js';
import { AvailabilityService } from './services/availabilityService.js';
import { OtpService } from './services/otpService.js';
import type { Notifier } from './services/notifications/notifier.js';
import { SimulatedNotifier } from './services/notifications/simulatedNotifier.js';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler.js';
import { adminRouter } from './http/routes/admin.js';
import { adminCatalogRouter } from './http/routes/adminCatalog.js';
import { analyticsRouter } from './http/routes/analytics.js';
import { appointmentsRouter } from './http/routes/appointments.js';
import { authRouter } from './http/routes/auth.js';
import { customersRouter } from './http/routes/customers.js';
import { healthRouter } from './http/routes/health.js';
import { referenceDataRouter } from './http/routes/referenceData.js';
import { RetentionService } from './services/retentionService.js';

export interface AppOptions {
  config: Config;
  db: Db;
  logger: Logger;
  /** Override for tests / alternative delivery channels */
  notifier?: Notifier;
  /** Override for deterministic tests */
  clock?: () => Date;
  /** Test-only: observe generated OTP codes without a real inbox. Never used in production. */
  onOtpCode?: (contact: string, code: string) => void;
}

export function createApp({ config, db, logger, notifier, clock = () => new Date(), onOtpCode }: AppOptions): Express {
  const branches = new BranchRepository(db);
  const services = new ServiceRepository(db);
  const appointmentRepo = new AppointmentRepository(db);
  const notificationRepo = new NotificationRepository(db);
  const analyticsRepo = new AnalyticsRepository(db);
  const auditLogRepo = new AuditLogRepository(db);
  const otpRepo = new OtpRepository(db);
  const staffUserRepo = new StaffUserRepository(db);
  const jobLockRepo = new JobLockRepository(db);

  const auth = new AuthService({
    appointments: appointmentRepo,
    staffUsers: staffUserRepo,
    secret: config.AUTH_SECRET,
    maxLoginAttempts: config.ADMIN_MAX_LOGIN_ATTEMPTS,
    lockoutMinutes: config.ADMIN_LOCKOUT_MINUTES,
    logger,
    clock,
  });
  const analytics = new AnalyticsService(analyticsRepo, clock);
  const otp = new OtpService({ otps: otpRepo, secret: config.AUTH_SECRET, logger, clock, onCodeGenerated: onOtpCode });
  const retention = new RetentionService({
    appointments: appointmentRepo,
    locks: jobLockRepo,
    retentionDays: config.DATA_RETENTION_DAYS,
    logger,
    clock,
  });

  const policy = { horizonDays: config.BOOKING_HORIZON_DAYS, minLeadMinutes: config.BOOKING_MIN_LEAD_MINUTES };
  const availability = new AvailabilityService({ branches, services, appointments: appointmentRepo, policy, clock });
  const appointments = new AppointmentService({
    db,
    branches,
    services,
    appointments: appointmentRepo,
    notifications: notificationRepo,
    availability,
    notifier: notifier ?? new SimulatedNotifier(notificationRepo, logger, clock),
    logger,
    clock,
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // TLS termination happens at the edge (load balancer / reverse proxy);
          // leaving this on would break plain-HTTP local runs.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );

  if (config.CORS_ORIGIN) {
    app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  }

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      quietReqLogger: true,
      // One compact line per request; no headers or bodies.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(express.json({ limit: '16kb' }));

  const api = express.Router();
  api.use(healthRouter(db));
  api.use(referenceDataRouter({ branches, services, availability }));
  api.use(appointmentsRouter({ appointments, auth, rateLimiting: config.NODE_ENV !== 'test' }));
  api.use(authRouter({ auth, auditLog: auditLogRepo, rateLimiting: config.NODE_ENV !== 'test', clock }));
  api.use(customersRouter({ appointments, otp, auth, rateLimiting: config.NODE_ENV !== 'test' }));
  api.use(analyticsRouter({ analytics, auth }));
  api.use(
    adminRouter({ appointments, auth, auditLog: auditLogRepo, retention, clock, rateLimiting: config.NODE_ENV !== 'test' }),
  );
  api.use(adminCatalogRouter({ branches, services, auth, auditLog: auditLogRepo, clock }));
  api.use(notFoundHandler);
  app.use('/api', api);

  const staticDir = config.STATIC_DIR ? resolve(config.STATIC_DIR) : undefined;
  if (staticDir && existsSync(staticDir)) {
    // Hashed assets can be cached forever; index.html must always be revalidated
    // so a deploy is picked up immediately.
    app.use(express.static(staticDir, { index: false, maxAge: '1y', immutable: true }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(staticDir, 'index.html'));
    });
    logger.info({ staticDir }, 'serving web app');
  } else if (staticDir) {
    logger.warn({ staticDir }, 'STATIC_DIR does not exist; serving API only');
  }

  app.use(errorHandler);
  return app;
}
