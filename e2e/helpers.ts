import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** A fresh, unlikely-to-collide contact per test, since the e2e database is shared across the whole run. */
export function uniqueCustomer() {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    name: 'Banele Ndlovu',
    email: `banele.${stamp}@example.com`,
    phone: '082 555 0123',
  };
}

/**
 * A date at least `minDaysAhead` days out that isn't a Sunday (Sandton City,
 * used throughout these specs, is closed Sundays per the seed data) --
 * avoids tests going flaky depending on which day of the week they happen to
 * run on.
 */
export function nextOpenWeekdayIso(minDaysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Books an appointment end to end (service -> branch -> date/time -> details
 * -> consent -> confirm) and returns the reference and access token stored in
 * session storage, plus the customer used.
 */
export async function bookAppointment(
  page: Page,
  options: { serviceName?: string; branchName?: string } = {},
): Promise<{ reference: string; customer: ReturnType<typeof uniqueCustomer> }> {
  const customer = uniqueCustomer();
  const serviceName = options.serviceName ?? 'Open a new account';
  const branchName = options.branchName ?? 'Sandton City';

  await page.goto('/');
  await page.getByText(serviceName, { exact: false }).first().click();
  await page.getByText(branchName, { exact: false }).first().click();
  await page.locator('input[type="date"]').fill(nextOpenWeekdayIso(1));
  await page.locator('.slot:not(:disabled)').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.fill('#name', customer.name);
  await page.fill('#email', customer.email);
  await page.fill('#phone', customer.phone);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Confirm appointment' }).click();

  await page.waitForURL(/\/confirmation\/APT-/);
  const reference = page.url().split('/confirmation/')[1] as string;
  return { reference, customer };
}

/**
 * Reads the most recently "delivered" OTP code from the e2e server's log
 * file (see playwright.config.ts, which redirects the webServer's stdout
 * there). Delivery is simulated everywhere in this app; this is the same
 * shortcut a developer would use locally to read a code without a real inbox.
 */
export function latestSimulatedOtpCode(): string {
  const log = readFileSync('e2e/.tmp/server.log', 'utf8');
  const matches = [...log.matchAll(/verification code is (\d{6})/g)];
  const last = matches.at(-1);
  if (!last) throw new Error('No simulated OTP code found in server log yet');
  return last[1] as string;
}
