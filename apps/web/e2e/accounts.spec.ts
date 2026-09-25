// Accounts: Month logs a month's balances under a year of net worth; Year reads the record, read-only.

import { expect, type Page } from '@playwright/test';
import { openApp, settle, test } from './app';

test.beforeEach(async ({ page }) => openApp(page));

const pane = (page: Page, title: string) =>
	page.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) });

test('the month picker moves Log balances and the board to that month', async ({ page }) => {
	await page.goto('/accounts?month=2026-01');
	await settle(page);
	await expect(pane(page, 'Log balances')).toBeVisible();
	await expect(pane(page, 'Net worth & assets')).toContainText('2026');

	await page.getByRole('button', { name: 'Previous month' }).click();
	await settle(page);
	await expect(page).toHaveURL(/month=2025-12/);
	await expect(pane(page, 'Net worth & assets')).toContainText('2025');

	await page.goBack();
	await expect(page).toHaveURL(/month=2026-01/);
});

test('Year is a path a reload keeps, and it logs nothing', async ({ page }) => {
	await page.goto('/accounts?month=2025-09');
	await page.getByRole('tab', { name: 'Year' }).click();
	await settle(page);
	await expect(page).toHaveURL(/\/accounts\/year\?month=2025-09/);
	await expect(pane(page, 'Yearly snapshots')).toBeVisible();
	await expect(pane(page, 'Log balances')).toHaveCount(0);

	await page.reload();
	await settle(page);
	await expect(page).toHaveURL(/\/accounts\/year$/);
	await expect(page.getByRole('tab', { name: 'Year' })).toHaveAttribute('aria-selected', 'true');
});

test('planning figures have left for Planning', async ({ page }) => {
	await page.goto('/accounts/year');
	await settle(page);
	await expect(pane(page, 'Financial progress')).toHaveCount(0);
	await expect(page.getByText('Years of freedom')).toHaveCount(0);
});
