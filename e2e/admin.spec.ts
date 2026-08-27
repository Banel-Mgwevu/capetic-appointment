import { expect, test } from '@playwright/test';
import { bookAppointment } from './helpers';

async function adminSignIn(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'e2e-admin-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/analytics');
}

test.describe('staff tools', () => {
  test('rejects a wrong password', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Incorrect username or password')).toBeVisible();
  });

  test('shows the analytics dashboard after signing in', async ({ page }) => {
    await adminSignIn(page);
    await expect(page.getByRole('heading', { name: 'Branch appointment analytics' })).toBeVisible();
    await expect(page.getByText('Confirmed')).toBeVisible();
  });

  test('looks up a booking, cancels it on the customer\u2019s behalf, and records both in the audit log', async ({ page }) => {
    const { reference } = await bookAppointment(page);

    await adminSignIn(page);
    await page.goto('/admin/lookup');
    await page.fill('#reference', reference);
    await page.getByRole('button', { name: 'Look up' }).click();

    await expect(page.getByText(reference)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(page.getByText('CANCELLED', { exact: false })).toBeVisible();

    await page.goto('/admin/audit-log');
    const row = page.locator('tr', { hasText: reference });
    await expect(row.filter({ hasText: 'Looked up a booking' })).toHaveCount(1);
    await expect(row.filter({ hasText: 'Cancelled a booking' })).toHaveCount(1);
  });

  test('a customer access token cannot open staff pages', async ({ page }) => {
    await bookAppointment(page);
    await page.goto('/admin/analytics');
    // No admin token present, so the app sends us to sign in rather than showing the dashboard.
    await page.waitForURL('**/admin/login');
  });
});
