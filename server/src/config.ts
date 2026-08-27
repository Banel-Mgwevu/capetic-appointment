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
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  /** Plaintext only for this exercise; a real deployment would store a hash. */
  ADMIN_PASSWORD: z.string().min(1).default('changeme123'),
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
