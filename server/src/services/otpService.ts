import { contactChannel, normaliseContact } from '../domain/customer.js';
import { ConflictError } from '../domain/errors.js';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../domain/otp.js';
import type { Logger } from '../logger.js';
import type { OtpRepository } from '../repositories/otpRepository.js';

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export interface OtpServiceDeps {
  otps: OtpRepository;
  secret: string;
  logger: Logger;
  clock: () => Date;
  /**
   * Optional observability/test hook, called after a code is generated with
   * the normalised contact and the plaintext code. Never wired up in
   * production (delivery is via the simulated log line only); tests use it
   * to read back the code without needing a real email/SMS inbox.
   */
  onCodeGenerated?: ((contact: string, code: string) => void) | undefined;
}

/**
 * One-time codes gate the "my appointments" list: unlike a single booking
 * reference (a random secret), an email address or phone number alone isn't
 * secret, so listing every booking tied to one needs a stronger check than
 * the per-booking access flow.
 */
export class OtpService {
  constructor(private readonly deps: OtpServiceDeps) {}

  /**
   * Always "succeeds" from the caller's point of view regardless of whether
   * the contact has any bookings, so the response can't be used to probe
   * which emails or phone numbers are registered.
   */
  requestCode(rawContact: string): void {
    const contact = normaliseContact(rawContact);
    const code = generateOtpCode();
    const codeHash = hashOtpCode(this.deps.secret, code);
    const now = this.deps.clock();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000).toISOString();

    this.deps.otps.create({ contact, codeHash, expiresAt, createdAt: now.toISOString() });
    this.deps.onCodeGenerated?.(contact, code);

    // Simulated delivery, same as appointment notifications: logged rather
    // than sent, since this project has no real email/SMS gateway configured.
    this.deps.logger.info(
      { channel: contactChannel(contact) },
      `[SIMULATED ${contactChannel(contact)}] Your Capitec appointments verification code is ${code} (expires in ${OTP_TTL_MINUTES} minutes)`,
    );
  }

  /** Returns the normalised contact on success, for the caller to issue a session token against. */
  verifyCode(rawContact: string, code: string): string {
    const contact = normaliseContact(rawContact);
    const record = this.deps.otps.findLatestActive(contact);
    const invalid = (): never => {
      throw new ConflictError('CODE_INVALID', 'That code is incorrect or has expired.');
    };
    if (!record) return invalid();
    if (new Date(record.expiresAt).getTime() < this.deps.clock().getTime()) return invalid();
    if (record.attempts >= MAX_ATTEMPTS) return invalid();

    if (!verifyOtpCode(this.deps.secret, code.trim(), record.codeHash)) {
      this.deps.otps.incrementAttempts(record.id);
      return invalid();
    }

    this.deps.otps.consume(record.id, this.deps.clock().toISOString());
    return contact;
  }
}
