// Analytics' picks: a period's bars narrow the board to that period in place, and only the heatmap leaves
// the page, for the rows behind a cell.

import { expect, type Page } from '@playwright/test';
import { openApp, settle, test } from './app';

test.beforeEach(async ({ page }) => openApp(page));

const band = (page: Page, card: string, label: string) =>
	page
		.locator('.card', { has: page.getByRole('heading', { name: card, exact: true }) })
		.locator(`rect.band[aria-label="${label}"]`);

const sankeyCaption = (page: Page) =>
	page.locator('.card', { has: page.getByRole('heading', { name: 'Where it all went' }) });

test("a month's bars narrow the board to that month, and again widen it", async ({ page }) => {
	await page.goto('/analytics?month=2025-08');
	await settle(page);
	const sep = band(page, 'Net income vs take-home vs spending vs saved', 'Sep');

	await sep.click();
	await settle(page);
	await expect(page).toHaveURL(/month=2025-09/);
	await expect(page).toHaveURL(/scope=month/);
	await expect(sep).toHaveAttribute('aria-pressed', 'true');
	await expect(sankeyCaption(page)).toContainText('Sep 2025');
	await expect(page.locator('tr.marked th[scope=row]')).toContainText('Sep');
	await expect(page.getByText(/vs your .* \/ mo average/).first()).toBeVisible();

	await sep.click();
	await settle(page);
	await expect(page).not.toHaveURL(/scope=/);
	await expect(page.locator('tr.marked')).toHaveCount(0);
	await expect(sankeyCaption(page)).toContainText('2025');

	await page.goBack();
	await expect(page).toHaveURL(/scope=month/);
});

test("a year's bars narrow the Year view to it on every year axis", async ({ page }) => {
	await page.goto('/analytics/year');
	await settle(page);

	// By keyboard, which is also how a tall bar over the band's centre is stepped around.
	await band(page, 'Savings rate by year', '2025').focus();
	await page.keyboard.press('Enter');
	await settle(page);
	await expect(page).toHaveURL(/scope=year/);
	await expect(page).toHaveURL(/month=2025-/);
	await expect(band(page, 'Net income vs take-home vs spending vs saved', '2025')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('tr.marked th[scope=row]')).toContainText('2025');
	await expect(sankeyCaption(page)).toContainText('2025');

	await page.goBack();
	await expect(page).not.toHaveURL(/scope=/);
	await expect(sankeyCaption(page)).toContainText('Lifetime');
});

test('switching the range widens the board again', async ({ page }) => {
	await page.goto('/analytics?month=2025-09&scope=month');
	await page.getByRole('tab', { name: 'Year' }).click();
	await settle(page);
	await expect(page).toHaveURL(/\/analytics\/year/);
	await expect(page).not.toHaveURL(/scope=/);
});

test('a Category by month cell opens its rows on Transactions, and back returns', async ({
	page
}) => {
	await page.goto('/analytics?month=2025-09');
	await settle(page);
	const cell = page.locator('table button.pick[aria-label*=" · "]').first();
	const [, category] = (await cell.getAttribute('aria-label'))!.split(' · ');

	await cell.click();
	await expect(page).toHaveURL(/\/transactions\?/);
	await expect(page).toHaveURL(new RegExp(`category=${encodeURIComponent(category!)}`));

	await page.goBack();
	await expect(page).toHaveURL(/\/analytics/);
});

test('the Year view shows the last ten years unless another span is picked', async ({ page }) => {
	await page.goto('/analytics/year');
	await settle(page);
	const spans = page.getByRole('tablist', { name: 'Years shown' });
	await expect(spans.getByRole('tab', { name: '10Y' })).toHaveAttribute('aria-selected', 'true');

	await spans.getByRole('tab', { name: '5Y' }).click();
	await expect(page).toHaveURL(/span=5/);
	await spans.getByRole('tab', { name: '10Y' }).click();
	await expect(page).not.toHaveURL(/span=/);
});
