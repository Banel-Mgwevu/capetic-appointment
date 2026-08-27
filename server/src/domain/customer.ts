/**
 * Customer-facing validation rules shared by the API schemas.
 */

/** South African mobile/landline number: 0XXXXXXXXX or +27XXXXXXXXX, spaces allowed. */
const SA_PHONE_RE = /^(?:\+27|0)[1-9]\d{8}$/;

export function normalisePhone(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, '');
  if (!SA_PHONE_RE.test(compact)) return null;
  return compact.startsWith('0') ? `+27${compact.slice(1)}` : compact;
}

/**
 * South African ID numbers are 13 digits: YYMMDD SSSS C A Z where Z is a Luhn
 * check digit. We validate the date portion loosely and the check digit strictly.
 */
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

/**
 * Normalises a customer-supplied "email or phone" for comparison purposes:
 * emails are lower-cased and trimmed; phone-shaped input is passed through
 * `normalisePhone`. Used both for booking-access verification and the
 * "my appointments" lookup, so the same value always compares equal to
 * itself regardless of how the customer typed it.
 */
export function normaliseContact(input: string): string {
  const trimmed = input.trim();
  const asPhone = normalisePhone(trimmed);
  if (asPhone) return asPhone;
  return trimmed.toLowerCase().replace(/[\s()-]/g, '');
}

export function contactChannel(normalisedContact: string): 'EMAIL' | 'SMS' {
  return normalisedContact.startsWith('+') ? 'SMS' : 'EMAIL';
}
