import { expect, test } from '@playwright/test';
import { bookAppointment } from './helpers';

test.describe('reschedule', () => {
  test('a customer can move their appointment to a different day', async ({ page }) => {
    const { reference } = await bookAppointment(page);

    await page.getByRole('link', { name: 'Manage this appointment' }).click();
    await page.waitForURL(`**/appointments/${reference}`);

    await page.getByRole('button', { name: 'Reschedule' }).click();

    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    await page.locator('#reschedule-date').fill(dayAfterTomorrow.toISOString().slice(0, 10));
    await page.locator('.slot:not(:disabled)').first().click();
    await page.getByRole('button', { name: 'Confirm new time' }).click();

    await expect(page.getByText('This appointment has been moved 1 time')).toBeVisible();
  });

  test('cannot reschedule a cancelled appointment', async ({ page }) => {
    const { reference } = await bookAppointment(page);
    await page.getByRole('link', { name: 'Manage this appointment' }).click();
    await page.waitForURL(`**/appointments/${reference}`);

    await page.getByRole('button', { name: 'Cancel appointment' }).click();
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(page.getByRole('heading', { name: 'This appointment was cancelled' })).toBeVisible();

    // Once cancelled, the page no longer offers a reschedule action at all.
    await expect(page.getByRole('button', { name: 'Reschedule' })).toHaveCount(0);
  });
});
