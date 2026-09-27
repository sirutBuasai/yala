// Dashboard: every card a headline that opens the page owning its figures.

import { expect } from '@playwright/test';
import { openApp, settle, test } from './app';

test.beforeEach(async ({ page }) => openApp(page));

test('the cash flow title opens Analytics, and back returns', async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="month"] [role=link]').click();
	await settle(page);
	await expect(page).toHaveURL(/\/analytics$/);

	await page.goBack();
	await settle(page);
	await expect(page).toHaveURL(/\/$/);
});

test('titles are links only outside Edit, where a click on one renames it', async ({ page }) => {
	await settle(page);
	await expect(page.locator('[data-pane="month"] h2[role=link]')).toHaveCount(1);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await settle(page);
	await expect(page.locator('.board [role=link]')).toHaveCount(0);
});

test('the cash flow card itself opens nothing', async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="month"] .track').first().click();
	await settle(page);
	await expect(page).toHaveURL(/\/$/);
});

test('the Recent transactions title opens Transactions', async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="recent"] h2[role=link]').click();
	await settle(page);
	await expect(page).toHaveURL(/\/transactions$/);
});

test('a narrower card names fewer categories and rolls the rest into Other', async ({ page }) => {
	await settle(page);
	const key = page.locator('[data-pane="month"] .split').nth(1).locator('ul.key:not(.probe) li');
	const wide = await key.count();

	await page.setViewportSize({ width: 560, height: 1000 });
	await settle(page);
	const narrow = await key.count();
	expect(narrow).toBeLessThanOrEqual(wide);
	if (narrow < wide) await expect(key.last()).toContainText('Other');
});

test('the Net worth title opens Accounts', async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="networth"] [role=link]').click();
	await settle(page);
	await expect(page).toHaveURL(/\/accounts$/);
});

test("a day on Spending pace opens it in Transactions' calendar", async ({ page }) => {
	await settle(page);
	const chart = page.locator('[data-pane="pace"] svg.chart');
	const box = (await chart.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await settle(page);
	await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}&day=\d{4}-\d{2}-\d{2}$/);
	await expect(page.locator('[data-pane="calendar"]')).toBeInViewport();
});

test('a pending row in Needs attention opens Pending transactions', async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="attention"] button', { hasText: /pending transaction/ }).click();
	await settle(page);
	await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}$/);
	await expect(page.locator('[data-pane="pending"]')).toBeInViewport();
});

test("a recent transaction opens its month's history", async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="recent"] button').first().click();
	await settle(page);
	await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}$/);
	await expect(page.locator('[data-pane="history"]')).toBeInViewport();
});

test('Financial progress opens Planning', async ({ page }) => {
	await settle(page);
	await page.locator('[data-pane="progress"] [role=link]').click();
	await settle(page);
	await expect(page).toHaveURL(/\/planning$/);
});
