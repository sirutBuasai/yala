// Transactions' drill-ins: a figure opens the rows behind it, and back undoes the step.

import { expect } from '@playwright/test';
import { openApp, settle, showPage, test } from './app';

test.beforeEach(async ({ page }) => {
	await openApp(page);
	await showPage(page, 'Transactions');
});

test('a Spending by category row filters the history to it, and again clears it', async ({
	page
}) => {
	const row = page.locator('.bars button.pickrow').first();
	const category = (await row.locator('.name').innerText()).trim();

	await row.click();
	await expect(page).toHaveURL(new RegExp(`category=${encodeURIComponent(category)}`));
	await expect(row).toHaveAttribute('aria-pressed', 'true');

	await row.click();
	await expect(page).not.toHaveURL(/category=/);
});

test('a Category by month cell opens its month filtered to its category, and back undoes it', async ({
	page
}) => {
	const cell = page.locator('table button.pick[aria-label*=" · "]').first();
	const [month, category] = (await cell.getAttribute('aria-label'))!.split(' · ');

	await cell.click();
	await settle(page);
	await expect(page).toHaveURL(new RegExp(`category=${encodeURIComponent(category!)}`));
	await expect(page.getByRole('combobox', { name: 'Month' })).toContainText(month!);

	await page.goBack();
	await expect(page).not.toHaveURL(/category=/);
});

test('a Category by month label opens its month with the history unfiltered', async ({ page }) => {
	await page.goto('/transactions?type=txn&category=Grocery&q=shop');
	const label = page.locator('table th[scope=row] button.pick').first();
	const month = (await label.getAttribute('aria-label'))!;

	await label.click();
	await settle(page);
	await expect(page).not.toHaveURL(/type=|category=|q=/);
	await expect(page.getByRole('combobox', { name: 'Month' })).toContainText(month);
});

test('N opens Add entry, but not while a field has the keyboard', async ({ page }) => {
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('n');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await page.getByRole('searchbox').or(page.getByRole('textbox')).first().focus();
	await page.keyboard.press('n');
	await expect(dialog).toHaveCount(0);
});
