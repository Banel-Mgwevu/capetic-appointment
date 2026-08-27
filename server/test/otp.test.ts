import { describe, expect, it } from 'vitest';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../src/domain/otp.js';

describe('OTP codes', () => {
  it('generates a zero-padded 6-digit code', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it('verifies a code against its hash with the right secret', () => {
    const hash = hashOtpCode('secret-a', '123456');
    expect(verifyOtpCode('secret-a', '123456', hash)).toBe(true);
  });

  it('rejects the wrong code or the wrong secret', () => {
    const hash = hashOtpCode('secret-a', '123456');
    expect(verifyOtpCode('secret-a', '654321', hash)).toBe(false);
    expect(verifyOtpCode('secret-b', '123456', hash)).toBe(false);
  });

  it('rejects a malformed hash rather than throwing', () => {
    expect(verifyOtpCode('secret-a', '123456', 'not-hex')).toBe(false);
  });
});
