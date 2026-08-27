/**
 * Client-side checks give immediate feedback; the server re-validates
 * everything and is the source of truth (see server/src/http/schemas.ts).
 */
import type { CustomerInput } from './types';

export const SA_PHONE_RE = /^(?:\+27|0)[1-9]\d{8}$/;

export function isValidPhone(input: string): boolean {
  return SA_PHONE_RE.test(input.replace(/[\s()-]/g, ''));
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export function isValidSouthAfricanId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  const month = Number(id.slice(2, 4));
  const day = Number(id.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  let sum = 0;
  for (let i = 0; i < 13; i += 1) {
    let digit = Number(id[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export type CustomerErrors = Partial<Record<keyof CustomerInput, string>>;

export function validateCustomer(input: CustomerInput): CustomerErrors {
  const errors: CustomerErrors = {};
  if (input.name.trim().length < 2) errors.name = 'Enter your full name';
  if (!isValidEmail(input.email)) errors.email = 'Enter a valid email address';
  if (!isValidPhone(input.phone)) errors.phone = 'Enter a valid South African phone number';
  if (input.idNumber && !isValidSouthAfricanId(input.idNumber.trim())) {
    errors.idNumber = 'Enter a valid 13-digit South African ID number';
  }
  return errors;
}
