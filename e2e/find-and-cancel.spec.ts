import { expect, test } from '@playwright/test';
import { bookAppointment } from './helpers';

test.describe('find a booking and cancel', () => {
  test('looks up a booking by reference and contact, then cancels it', async ({ page }) => {
    const { reference, customer } = await bookAppointment(page);

    await page.goto('/appointments');
    await page.fill('#reference', reference);
    await page.fill('#contact', customer.email);
    await page.getByRole('button', { name: 'View my appointment' }).click();

    await page.waitForURL(`**/appointments/${reference}`);
    await expect(page.getByText(reference)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel appointment' }).click();
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();

    await expect(page.getByText('Cancelled. The slot has been released')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This appointment was cancelled' })).toBeVisible();
  });

  test('rejects a contact that does not match the booking', async ({ page }) => {
    const { reference } = await bookAppointment(page);

    await page.goto('/appointments');
    await page.fill('#reference', reference);
    await page.fill('#contact', 'someone-else@example.com');
    await page.getByRole('button', { name: 'View my appointment' }).click();

    await expect(page.getByText('does not match this booking')).toBeVisible();
  });

  test('rejects an unknown reference', async ({ page }) => {
    await page.goto('/appointments');
    await page.fill('#reference', 'APT-ZZZZZZ');
    await page.fill('#contact', 'nobody@example.com');
    await page.getByRole('button', { name: 'View my appointment' }).click();

    await expect(page.getByText("couldn't find a booking")).toBeVisible();
  });
});
