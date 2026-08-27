import { expect, test } from '@playwright/test';
import { bookAppointment, latestSimulatedOtpCode } from './helpers';

test.describe('my appointments (OTP)', () => {
  test('verifies a one-time code and lists every booking for that contact', async ({ page }) => {
    const { reference, customer } = await bookAppointment(page);

    await page.goto('/my-appointments');
    await page.fill('#my-contact', customer.email);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByText(`Enter the code we sent to ${customer.email}`)).toBeVisible();

    const code = latestSimulatedOtpCode();
    await page.fill('#my-code', code);
    await page.getByRole('button', { name: 'Verify' }).click();

    await expect(page.getByText('Open a new account')).toBeVisible();
    await expect(page.getByText('Confirmed')).toBeVisible();

    // Viewing from the list doesn't ask the customer to verify a second time.
    await page.getByRole('button', { name: 'View' }).click();
    await page.waitForURL(`**/appointments/${reference}`);
    await expect(page.getByText(reference)).toBeVisible();
  });

  test('rejects an incorrect code', async ({ page }) => {
    const { customer } = await bookAppointment(page);

    await page.goto('/my-appointments');
    await page.fill('#my-contact', customer.email);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await page.fill('#my-code', '000000');
    await page.getByRole('button', { name: 'Verify' }).click();

    await expect(page.getByText('incorrect or has expired')).toBeVisible();
  });

  test('does not reveal whether a contact has any bookings', async ({ page }) => {
    await page.goto('/my-appointments');
    await page.fill('#my-contact', `nobody.${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    // Same next step regardless -- no error, no "no bookings found" message here.
    await expect(page.getByText('Enter the code we sent to')).toBeVisible();
  });
});
