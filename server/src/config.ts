import { z } from 'zod';

/**
 * All runtime configuration comes from the environment and is validated once at
 * startup, so a misconfigured deployment fails fast with a clear message rather
 * than misbehaving later.
 */
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/appointments.db'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated list of allowed origins. Unset = same-origin only. */
  CORS_ORIGIN: z.string().optional(),
  /** Directory containing the built web app. Unset = API only. */
  STATIC_DIR: z.string().optional(),
  BOOKING_HORIZON_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BOOKING_MIN_LEAD_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(30),
  /** Secret used to sign customer-access and admin session tokens. */
  AUTH_SECRET: z.string().min(16).default('dev-only-secret-change-me-please-32chars'),
  /**
   * Used only to bootstrap the *first* staff account on a fresh database
   * (see StaffUserRepository / app.ts). Once at least one row exists in
   * `staff_users`, these env vars are ignored entirely -- accounts are
   * managed with `npm run create-staff-user -w server -- <username> <password>`.
   */
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_PASSWORD: z.string().min(1).default('changeme123'),
  /** Failed admin logins before an account is temporarily locked. */
  ADMIN_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  /** How long an account stays locked after hitting the attempt limit. */
  ADMIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(15),

  /** How long a cancelled/completed booking's personal details are kept before anonymisation. */
  DATA_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  /** How often the retention sweep runs. Set 0 to disable the background job (e.g. in tests). */
  RETENTION_CHECK_INTERVAL_HOURS: z.coerce.number().min(0).max(24 * 30).default(24),
  /** How often the reminder job checks for appointments happening tomorrow. 0 disables it. */
  REMINDER_CHECK_INTERVAL_MINUTES: z.coerce.number().min(0).max(24 * 60).default(60),
  /** Contact address shown on the privacy notice for data-subject requests. */
  PRIVACY_CONTACT_EMAIL: z.string().min(1).default('privacy@capitec.example'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return result.data;
}
