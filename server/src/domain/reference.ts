import { randomInt } from 'node:crypto';

/**
 * Booking references are short, human-friendly codes customers read out at the
 * branch or type into the lookup form. The alphabet omits characters that are
 * easily confused when spoken or printed (0/O, 1/I/L).
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export const REFERENCE_RE = /^APT-[A-HJ-KM-NP-Z2-9]{6}$/;

export function generateReference(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `APT-${code}`;
}

export function normaliseReference(input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/\s+/g, '');
  return trimmed.startsWith('APT-') ? trimmed : `APT-${trimmed}`;
}
