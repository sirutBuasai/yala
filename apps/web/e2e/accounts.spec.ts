// Accounts: Month logs a month's balances under a year of net worth; Year reads the record, read-only.

import { expect, type Page } from '@playwright/test';
import { openApp, settle, test } from './app';

test.beforeEach(async ({ page }) => openApp(page));

const pane = (page: Page, title: string) =>
	page.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) });

const band = (page: Page, card: string, label: string) =>
	pane(page, card).locator(`rect.band[aria-label="${label}"]`);

test("a month's bars narrow the KPI cards to it and mark it on every chart, and again widen", async ({
	page
}) => {
	await page.goto('/accounts?month=2026-07');
	await settle(page);
	const apr = band(page, 'You vs the market, by month', 'Apr');

	await apr.click();
	await settle(page);
	await expect(page).toHaveURL(/month=2026-04/);
	await expect(page).toHaveURL(/scope=month/);
	await expect(apr).toHaveAttribute('aria-pressed', 'true');
	await expect(band(page, 'Change by asset type', 'Apr')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('end of Apr 2026')).toBeVisible();
	await expect(pane(page, 'Net worth & assets').locator('.focusband')).toHaveCount(1);
	await expect(pane(page, 'Monthly snapshots').locator('tr.marked th[scope=row]')).toContainText(
		'Apr'
	);

	await apr.click();
	await settle(page);
	await expect(page).not.toHaveURL(/scope=/);
	await expect(page.getByText('end of 2026')).toBeVisible();
	await expect(pane(page, 'Monthly snapshots').locator('tr.marked')).toHaveCount(0);
});

test('the year stepper moves the board and Log balances to the same month of that year', async ({
	page
}) => {
	await page.goto('/accounts?month=2026-01');
	await settle(page);
	await expect(pane(page, 'Log balances')).toBeVisible();

	await page.getByRole('button', { name: 'Previous year' }).click();
	await settle(page);
	await expect(page).toHaveURL(/month=2025-/);
	await expect(pane(page, 'Net worth & assets')).toContainText('2025');
});

test('an account in Where the money sits opens it in Log balances', async ({ page }) => {
	await page.goto('/accounts/year');
	await settle(page);
	await pane(page, 'Where the money sits').getByRole('button').first().click();
	await settle(page);
	await expect(page).toHaveURL(/\/accounts\?month=\d{4}-\d{2}$/);
	await expect(page.locator('[data-pane="balances"]')).toBeInViewport();
	await expect(pane(page, 'Log balances')).toBeVisible();

	await expect(page.locator('.tooltip')).toHaveCSS('opacity', '0');

	await page.goBack();
	await expect(page).toHaveURL(/\/accounts\/year/);
});

test("a year's bars narrow the Year view's KPI cards to its close and mark it everywhere", async ({
	page
}) => {
	await page.goto('/accounts/year');
	await settle(page);
	const year = band(page, 'You vs the market, by year', '2025');

	await year.click();
	await settle(page);
	await expect(page).toHaveURL(/scope=year/);
	await expect(band(page, 'Change by asset type', '2025')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('this year').first()).toBeVisible();
	await expect(pane(page, 'Yearly snapshots').locator('tr.marked th[scope=row]')).toContainText(
		'2025'
	);

	await year.click();
	await settle(page);
	await expect(page).not.toHaveURL(/scope=/);
});

test('the span scopes the Year view to its years', async ({ page }) => {
	await page.goto('/accounts/year');
	await settle(page);
	await page.getByRole('tab', { name: '5Y', exact: true }).click();
	await settle(page);
	await expect(page).toHaveURL(/span=5/);
});

test('Year is a path a reload keeps, and it logs nothing', async ({ page }) => {
	await page.goto('/accounts?month=2025-09');
	await page.getByRole('tab', { name: 'Yearly' }).click();
	await settle(page);
	await expect(page).toHaveURL(/\/accounts\/year$/);
	await expect(pane(page, 'Yearly snapshots')).toBeVisible();
	await expect(pane(page, 'Log balances')).toHaveCount(0);

	await page.reload();
	await settle(page);
	await expect(page).toHaveURL(/\/accounts\/year$/);
	await expect(page.getByRole('tab', { name: 'Yearly' })).toHaveAttribute('aria-selected', 'true');
});

test('planning figures have left for Planning', async ({ page }) => {
	await page.goto('/accounts/year');
	await settle(page);
	await expect(pane(page, 'Financial progress')).toHaveCount(0);
	await expect(page.getByText('Years of freedom')).toHaveCount(0);
});

test("a click on a Year view line picks its point's year, and again widens", async ({ page }) => {
	await page.goto('/accounts/year');
	await settle(page);
	const chart = pane(page, 'Net worth & assets').locator('svg.chart');
	await chart.scrollIntoViewIfNeeded();
	const box = (await chart.boundingBox())!;
	const at = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 };

	await page.mouse.click(at.x, at.y);
	await settle(page);
	await expect(page).toHaveURL(/scope=year/);
	await expect(
		pane(page, 'Net worth & assets').locator('rect.band[aria-pressed="true"]')
	).toHaveCount(1);
	await expect(pane(page, 'Liabilities').locator('.focusband')).toHaveCount(1);

	await page.mouse.click(at.x, at.y);
	await settle(page);
	await expect(page).not.toHaveURL(/scope=/);
});

test("a click on a Month view line picks its point's month", async ({ page }) => {
	await page.goto('/accounts?month=2026-07');
	await settle(page);
	const chart = pane(page, 'Net worth & assets').locator('svg.chart');
	await chart.scrollIntoViewIfNeeded();
	const box = (await chart.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
	await settle(page);
	await expect(page).toHaveURL(/month=2026-\d{2}&scope=month$/);
	await expect(pane(page, 'Asset allocations').locator('.focusband')).toHaveCount(1);
});
