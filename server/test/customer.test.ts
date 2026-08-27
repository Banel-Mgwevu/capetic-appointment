import { describe, expect, it } from 'vitest';
import { isValidSouthAfricanId, normalisePhone } from '../src/domain/customer.js';
import { generateReference, normaliseReference, REFERENCE_RE } from '../src/domain/reference.js';

describe('normalisePhone', () => {
  it('accepts local and international formats and returns E.164', () => {
    expect(normalisePhone('082 555 0123')).toBe('+27825550123');
    expect(normalisePhone('+27 82 555 0123')).toBe('+27825550123');
    expect(normalisePhone('(011) 555-0123')).toBe('+27115550123');
  });
  it('rejects malformed numbers', () => {
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('0025550123')).toBeNull();
    expect(normalisePhone('+44 20 7946 0958')).toBeNull();
  });
});

describe('isValidSouthAfricanId', () => {
  it('accepts a number with a valid Luhn check digit', () => {
    expect(isValidSouthAfricanId('8001015009087')).toBe(true);
  });
  it('rejects bad check digits, lengths and dates', () => {
    expect(isValidSouthAfricanId('8001015009088')).toBe(false);
    expect(isValidSouthAfricanId('800101500908')).toBe(false);
    expect(isValidSouthAfricanId('8013015009087')).toBe(false);
    expect(isValidSouthAfricanId('abcdefghijklm')).toBe(false);
  });
});

describe('references', () => {
  it('generates references in the documented format', () => {
    for (let i = 0; i < 50; i += 1) expect(generateReference()).toMatch(REFERENCE_RE);
  });
  it('normalises user input', () => {
    expect(normaliseReference(' apt-abc234 ')).toBe('APT-ABC234');
    expect(normaliseReference('abc234')).toBe('APT-ABC234');
  });
});
