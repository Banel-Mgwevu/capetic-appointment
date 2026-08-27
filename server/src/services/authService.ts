import { timingSafeEqual } from 'node:crypto';
import { normaliseContact } from '../domain/customer.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { verifyPassword } from '../domain/password.js';
import { issueToken, verifyToken, type TokenPayload } from '../domain/token.js';
import type { Logger } from '../logger.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';

const CUSTOMER_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const CONTACT_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes, for the "my appointments" list
const ADMIN_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export interface AuthDeps {
  appointments: AppointmentRepository;
  secret: string;
  adminUsername: string;
  /** Preferred. A scrypt hash from `npm run hash-password`. */
  adminPasswordHash?: string | undefined;
  /** Dev-only fallback when no hash is configured. */
  adminPassword: string;
  logger: Logger;
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

export class AuthService {
  constructor(private readonly deps: AuthDeps) {
    if (!deps.adminPasswordHash) {
      deps.logger.warn(
        'ADMIN_PASSWORD_HASH is not set; falling back to plaintext ADMIN_PASSWORD. ' +
          'Run `npm run hash-password -w server -- <password>` and set ADMIN_PASSWORD_HASH before deploying.',
      );
    }
  }

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

  async adminLogin(username: string, password: string): Promise<{ token: string; expiresInSeconds: number }> {
    const validUsername = constantTimeEquals(username, this.deps.adminUsername);
    const validPassword = this.deps.adminPasswordHash
      ? await verifyPassword(password, this.deps.adminPasswordHash)
      : constantTimeEquals(password, this.deps.adminPassword);

    if (!validUsername || !validPassword) {
      throw new ValidationError('Incorrect username or password.');
    }
    const token = issueToken(this.deps.secret, 'admin', username, ADMIN_TOKEN_TTL_SECONDS);
    return { token, expiresInSeconds: ADMIN_TOKEN_TTL_SECONDS };
  }

  verifyAdminToken(token: string): TokenPayload | null {
    return verifyToken(this.deps.secret, token, 'admin');
  }
}
