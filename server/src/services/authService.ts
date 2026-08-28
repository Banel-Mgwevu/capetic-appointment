import { timingSafeEqual } from 'node:crypto';
import { normaliseContact } from '../domain/customer.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { hashPassword, verifyPassword } from '../domain/password.js';
import { issueToken, verifyToken, type TokenPayload } from '../domain/token.js';
import type { Logger } from '../logger.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';
import type { StaffUserRepository } from '../repositories/staffUserRepository.js';

const CUSTOMER_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const CONTACT_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes, for the "my appointments" list
const ADMIN_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export interface AuthDeps {
  appointments: AppointmentRepository;
  staffUsers: StaffUserRepository;
  secret: string;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  logger: Logger;
  clock: () => Date;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Compare against a fixed-length buffer first so the timing of a length
  // mismatch doesn't itself leak information about the expected value.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * A dummy hash to compare against when the username doesn't exist, so a
 * login attempt against an unknown username takes roughly the same time as
 * one against a real account with a wrong password -- otherwise the response
 * time itself would reveal which usernames are valid.
 */
const DECOY_HASH_PROMISE = hashPassword('not-a-real-password-just-for-timing');

export class AuthService {
  constructor(private readonly deps: AuthDeps) {}

  /** Issued right after a successful booking, when the caller already proved ownership by creating it. */
  issueAppointmentToken(reference: string): { token: string; expiresInSeconds: number } {
    const token = issueToken(this.deps.secret, 'customer', reference, CUSTOMER_TOKEN_TTL_SECONDS);
    return { token, expiresInSeconds: CUSTOMER_TOKEN_TTL_SECONDS };
  }

  /**
   * "Logging in" to view a booking: proving you know the reference *and* the
   * email or phone number on file, without a customer account system.
   */
  accessAppointment(reference: string, contact: string): { token: string; expiresInSeconds: number } {
    const appointment = this.deps.appointments.findByReference(reference);
    if (!appointment) throw new NotFoundError('Appointment');

    const given = normaliseContact(contact);
    const matchesEmail = constantTimeEquals(given, normaliseContact(appointment.customerEmail));
    const matchesPhone = constantTimeEquals(given, normaliseContact(appointment.customerPhone));
    if (!matchesEmail && !matchesPhone) {
      throw new ConflictError('VERIFICATION_FAILED', 'That email or phone number does not match this booking.');
    }

    const token = issueToken(this.deps.secret, 'customer', reference, CUSTOMER_TOKEN_TTL_SECONDS);
    return { token, expiresInSeconds: CUSTOMER_TOKEN_TTL_SECONDS };
  }

  verifyCustomerToken(token: string, reference: string): boolean {
    const payload = verifyToken(this.deps.secret, token, 'customer');
    return payload !== null && payload.subject === reference;
  }

  /** Issued once a "my appointments" OTP has been verified for this contact. */
  issueContactToken(normalisedContact: string): { token: string; expiresInSeconds: number } {
    const token = issueToken(this.deps.secret, 'contact', normalisedContact, CONTACT_TOKEN_TTL_SECONDS);
    return { token, expiresInSeconds: CONTACT_TOKEN_TTL_SECONDS };
  }

  /** Returns the verified contact the token was issued for, or null. */
  verifyContactToken(token: string): string | null {
    const payload = verifyToken(this.deps.secret, token, 'contact');
    return payload?.subject ?? null;
  }

  /**
   * Per-staff sign-in, backed by `staff_users` rather than a single shared
   * account. Failed attempts lock the *account* (not the IP -- the request
   * rate limiter already covers IP-based throttling upstream of this), so
   * repeatedly guessing one person's password stops working well before a
   * real password could be brute-forced, independent of how many different
   * source IPs the attempt comes from.
   */
  async adminLogin(username: string, password: string): Promise<{ token: string; expiresInSeconds: number }> {
    const user = this.deps.staffUsers.findByUsername(username);
    const now = this.deps.clock();

    if (!user) {
      // Still hash something, so this branch takes about as long as a real
      // account with a wrong password -- a fast rejection here would let an
      // attacker enumerate valid usernames purely by response time.
      await verifyPassword(password, await DECOY_HASH_PROMISE);
      throw new ValidationError('Incorrect username or password.');
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime()) {
      const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - now.getTime()) / 60_000);
      throw new ConflictError(
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
      );
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      const failedAttempts = user.failedAttempts + 1;
      const lockedUntil =
        failedAttempts >= this.deps.maxLoginAttempts
          ? new Date(now.getTime() + this.deps.lockoutMinutes * 60_000).toISOString()
          : null;
      this.deps.staffUsers.recordFailedAttempt(user.id, failedAttempts, lockedUntil);

      if (lockedUntil) {
        throw new ConflictError('ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${this.deps.lockoutMinutes} minutes.`);
      }
      throw new ValidationError('Incorrect username or password.');
    }

    this.deps.staffUsers.recordSuccessfulLogin(user.id, now.toISOString());
    const token = issueToken(this.deps.secret, 'admin', user.username, ADMIN_TOKEN_TTL_SECONDS);
    return { token, expiresInSeconds: ADMIN_TOKEN_TTL_SECONDS };
  }

  verifyAdminToken(token: string): TokenPayload | null {
    return verifyToken(this.deps.secret, token, 'admin');
  }

  /**
   * Creates a staff account, or resets its password (and clears any
   * lockout) if the username already exists. Only reachable by an
   * already-authenticated admin (see requireAdmin on the route), so this is
   * how additional staff accounts get added on a deployment with no shell
   * access -- an existing admin creates the next one through the app itself.
   */
  async createOrResetStaffUser(username: string, password: string): Promise<{ created: boolean }> {
    const existed = Boolean(this.deps.staffUsers.findByUsername(username));
    const passwordHash = await hashPassword(password);
    this.deps.staffUsers.upsert(username, passwordHash, this.deps.clock().toISOString());
    return { created: !existed };
  }
}
