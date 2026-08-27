import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Six digits, zero-padded, so it always reads and types like a normal OTP. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC rather than a plain hash, so guessing the stored value requires the server secret too. */
export function hashOtpCode(secret: string, code: string): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}

export function verifyOtpCode(secret: string, code: string, hash: string): boolean {
  const expected = hashOtpCode(secret, code);
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
