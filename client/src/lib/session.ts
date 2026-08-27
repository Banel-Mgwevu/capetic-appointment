/**
 * Tokens live in sessionStorage: they should not survive closing the tab (this
 * is a shared-device banking flow), and it keeps them out of browser history,
 * unlike a query-string token would be.
 */
const CUSTOMER_PREFIX = 'booking:access:';
const ADMIN_KEY = 'booking:admin-token';

export function storeAppointmentToken(reference: string, token: string): void {
  sessionStorage.setItem(CUSTOMER_PREFIX + reference, token);
}

export function getAppointmentToken(reference: string): string | null {
  return sessionStorage.getItem(CUSTOMER_PREFIX + reference);
}

export function clearAppointmentToken(reference: string): void {
  sessionStorage.removeItem(CUSTOMER_PREFIX + reference);
}

export function storeAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_KEY, token);
}

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_KEY);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_KEY);
}

const CONTACT_KEY = 'booking:contact-token';

export function storeContactToken(token: string): void {
  sessionStorage.setItem(CONTACT_KEY, token);
}

export function getContactToken(): string | null {
  return sessionStorage.getItem(CONTACT_KEY);
}

export function clearContactToken(): void {
  sessionStorage.removeItem(CONTACT_KEY);
}
