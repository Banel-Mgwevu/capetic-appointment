import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal signed-token scheme: base64url(payload).base64url(hmac-sha256).
 * Good enough for this project's two use cases (a customer proving they own
 * a booking, and an admin session) without pulling in a JWT library.
 */

export type TokenKind = 'customer' | 'admin';

export interface TokenPayload {
  kind: TokenKind;
  /** Booking reference for 'customer' tokens; admin username for 'admin' tokens. */
  subject: string;
  issuedAt: number;
  expiresAt: number;
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function sign(secret: string, data: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest());
}

export function issueToken(secret: string, kind: TokenKind, subject: string, ttlSeconds: number): string {
  const now = Date.now();
  const payload: TokenPayload = { kind, subject, issuedAt: now, expiresAt: now + ttlSeconds * 1000 };
  const encoded = base64url(Buffer.from(JSON.stringify(payload)));
  return `${encoded}.${sign(secret, encoded)}`;
}

/** Returns the payload if the token is well-formed, correctly signed and not expired; otherwise null. */
export function verifyToken(secret: string, token: string, expectedKind: TokenKind): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts as [string, string];

  const expected = sign(secret, encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.kind !== expectedKind) return null;
  if (payload.expiresAt < Date.now()) return null;
  return payload;
}
