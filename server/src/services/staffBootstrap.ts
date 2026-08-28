import { hashPassword } from '../domain/password.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { StaffUserRepository } from '../repositories/staffUserRepository.js';

/**
 * Creates the first staff account from ADMIN_USERNAME/ADMIN_PASSWORD(_HASH)
 * env vars, but only if `staff_users` is completely empty. Once any account
 * exists, these env vars are never consulted again -- manage accounts with
 * `npm run create-staff-user -w server -- <username> <password>` instead.
 *
 * This gives a deployment that already had ADMIN_USERNAME/ADMIN_PASSWORD_HASH
 * set (from before per-staff accounts existed) a working login with zero
 * manual migration steps.
 */
export async function bootstrapStaffUsers(
  staffUsers: StaffUserRepository,
  config: Pick<Config, 'ADMIN_USERNAME' | 'ADMIN_PASSWORD_HASH' | 'ADMIN_PASSWORD'>,
  logger: Logger,
  clock: () => Date = () => new Date(),
): Promise<void> {
  if (staffUsers.count() > 0) return;

  const passwordHash = config.ADMIN_PASSWORD_HASH ?? (await hashPassword(config.ADMIN_PASSWORD));
  if (!config.ADMIN_PASSWORD_HASH) {
    logger.warn(
      'ADMIN_PASSWORD_HASH is not set; bootstrapping the first staff account from the plaintext ' +
        'ADMIN_PASSWORD default. Run `npm run hash-password -w server -- <password>` and set ' +
        'ADMIN_PASSWORD_HASH, or create a proper account now with ' +
        '`npm run create-staff-user -w server -- <username> <password>`.',
    );
  }

  staffUsers.upsert(config.ADMIN_USERNAME, passwordHash, clock().toISOString());
  logger.info({ username: config.ADMIN_USERNAME }, 'bootstrapped first staff account');
}
