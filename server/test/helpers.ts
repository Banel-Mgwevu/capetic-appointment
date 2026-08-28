import pino from 'pino';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { normaliseContact } from '../src/domain/customer.js';
import { openDatabase, type Db } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { StaffUserRepository } from '../src/repositories/staffUserRepository.js';
import { bootstrapStaffUsers } from '../src/services/staffBootstrap.js';

export interface TestContext {
  app: Express;
  db: Db;
  /** Mutable so a test can move time forward */
  now: Date;
  /**
   * Returns a getter for the most recently generated OTP code for a contact.
   * Call before triggering the request that generates the code; call the
   * returned function afterwards to read it.
   */
  captureNextOtp: (contact: string) => () => string;
}

/**
 * Fresh in-memory database and app per test, with a fixed clock:
 * Wednesday 2 September 2026, 10:00 in Africa/Johannesburg (08:00 UTC).
 * Async because it also bootstraps the first staff account (admin /
 * test-admin-password), which requires hashing a password.
 */
export async function createTestContext(overrides: Partial<Record<string, string>> = {}): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
    AUTH_SECRET: 'test-only-secret-not-for-production-use',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'test-admin-password',
    ...overrides,
  });
  const db = openDatabase(':memory:');
  migrate(db);
  seed(db);

  const logger = pino({ level: 'silent' });
  await bootstrapStaffUsers(new StaffUserRepository(db), config, logger, () => new Date('2026-09-02T08:00:00Z'));

  const otpCodes = new Map<string, string>();

  const context: TestContext = {
    db,
    now: new Date('2026-09-02T08:00:00Z'),
    app: undefined as unknown as Express,
    captureNextOtp: (contact: string) => {
      const key = normaliseContact(contact);
      return () => {
        const code = otpCodes.get(key);
        if (!code) throw new Error(`No OTP code captured for ${contact}`);
        return code;
      };
    },
  };
  context.app = createApp({
    config,
    db,
    logger,
    clock: () => context.now,
    onOtpCode: (contact, code) => otpCodes.set(contact, code),
  });
  return context;
}

export const SANDTON = 1; // capacity 3, Mon–Sat
export const ROSEBANK = 2; // capacity 2, Mon–Sat
export const MENLYN = 3; // capacity 2, Mon–Fri

export const OPEN_ACCOUNT = 1; // 30 min
export const CREDIT_CONSULTATION = 3; // 60 min

export const TOMORROW = '2026-09-03'; // Thursday
export const NEXT_SATURDAY = '2026-09-05';
export const NEXT_SUNDAY = '2026-09-06';

export const customer = {
  name: 'Banele Ndlovu',
  email: 'banele@example.com',
  phone: '082 555 0123',
};
