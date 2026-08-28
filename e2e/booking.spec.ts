import { expect, test } from '@playwright/test';
import { bookAppointment, nextOpenWeekdayIso } from './helpers';

test.describe('booking flow', () => {
  test('books an appointment end to end and shows a confirmation slip', async ({ page }) => {
    const { reference } = await bookAppointment(page);

    expect(reference).toMatch(/^APT-[A-Z0-9]{6}$/);
    await expect(page.getByText(reference)).toBeVisible();
    await expect(page.getByText('CONFIRMED', { exact: false })).toBeVisible();
    await expect(page.getByText('Sandton City').first()).toBeVisible();
  });

  test('rejects booking without accepting the privacy notice', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Open a new account', { exact: false }).first().click();
    await page.getByText('Sandton City', { exact: false }).first().click();

    await page.locator('input[type="date"]').fill(nextOpenWeekdayIso(1));
    await page.locator('.slot:not(:disabled)').first().click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.fill('#name', 'Test Customer');
    await page.fill('#email', 'noconsent@example.com');
    await page.fill('#phone', '082 555 0199');
    // Consent left unchecked deliberately.
    await page.getByRole('button', { name: 'Confirm appointment' }).click();

    await expect(page.getByText('You must accept the privacy notice')).toBeVisible();
    expect(page.url()).not.toContain('/confirmation/');
  });

  test('the privacy notice page explains data retention', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'How we use your information' })).toBeVisible();
    await expect(page.getByText('How long we keep it')).toBeVisible();
  });
});
