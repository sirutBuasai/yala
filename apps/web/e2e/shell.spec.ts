// The app shell: one route per page, the focus month carried between them, and history that undoes a step.

import { expect, type Page } from '@playwright/test';
import { openApp, PAGE_LABELS, settle, showPage, test } from './app';

test.beforeEach(async ({ page }) => openApp(page));

const pages = (page: Page) => page.getByRole('navigation', { name: 'Pages' });

test('every sidebar link opens its page and marks itself current', async ({ page }) => {
	for (const label of PAGE_LABELS) {
		await showPage(page, label);
		await expect(pages(page).getByRole('link', { name: label, exact: true })).toHaveAttribute(
			'aria-current',
			'page'
		);
	}
});

test('back and forward move between pages', async ({ page }) => {
	await showPage(page, 'Transactions');
	await showPage(page, 'Accounts');
	await page.goBack();
	await expect(
		page.getByRole('heading', { level: 2, name: 'Transactions', exact: true })
	).toBeVisible();
	await page.goForward();
	await expect(
		page.getByRole('heading', { level: 2, name: 'Accounts', exact: true })
	).toBeVisible();
});

test('each view keeps its own picks: one view moving leaves the other as it was', async ({
	page
}) => {
	await page.goto('/analytics?month=2026-02&scope=month');
	await settle(page);
	await page.getByRole('tab', { name: 'Yearly', exact: true }).click();
	await expect(page).toHaveURL(/\/analytics\/year$/);

	await page.goto('/analytics/year?month=2024-09&scope=year');
	await settle(page);
	await page.getByRole('tab', { name: 'Monthly', exact: true }).click();
	await expect(page).toHaveURL(/\/analytics\?month=2026-02&scope=month$/);
	await page.getByRole('tab', { name: 'Yearly', exact: true }).click();
	await expect(page).toHaveURL(/\/analytics\/year\?month=2024-09&scope=year$/);
});

test('a page reopens at the view it was left on, as that view was left', async ({ page }) => {
	// Each settles first: a page remembers where it was left only once it is running.
	await page.goto('/transactions?month=2025-08&category=Grocery');
	await settle(page);
	await page.goto('/analytics/year?month=2025-09&scope=year');
	await settle(page);
	await pages(page).getByRole('link', { name: 'Transactions', exact: true }).click();
	await expect(page).toHaveURL(/\/transactions\?month=2025-08&category=Grocery$/);

	await pages(page).getByRole('link', { name: 'Analytics', exact: true }).click();
	await expect(page).toHaveURL(/\/analytics\/year\?month=2025-09&scope=year$/);
});

test('a view reopens at its own scroll', async ({ page }) => {
	await page.goto('/analytics?month=2025-09');
	await settle(page);
	await page.evaluate(() => window.scrollTo(0, 500));
	// Clicked where it is: a pointer click would first scroll the switch into view.
	await page
		.getByRole('tab', { name: 'Yearly', exact: true })
		.evaluate((el: HTMLElement) => el.click());
	await expect(page).toHaveURL(/\/analytics\/year$/);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

	await page.getByRole('tab', { name: 'Monthly', exact: true }).click();
	await expect(page).toHaveURL(/\/analytics\?month=2025-09$/);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);
});

test('a page reopens at the scroll it was left at', async ({ page }) => {
	await showPage(page, 'Transactions');
	await page.evaluate(() => window.scrollTo(0, 600));
	await showPage(page, 'Analytics');
	expect(await page.evaluate(() => window.scrollY)).toBe(0);

	await showPage(page, 'Transactions');
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
});

test('a click on a chart leaves no caret and selects no text', async ({ page }) => {
	await page.goto('/analytics?month=2025-09');
	await settle(page);
	await page
		.locator('rect.band')
		.first()
		.click({ position: { x: 2, y: 2 } });
	await page.locator('.card h2').first().click();
	const caret = await page.evaluate(() => {
		const at = getSelection()?.anchorNode?.parentElement;
		return at ? getComputedStyle(at).caretColor : 'none';
	});
	expect(caret).toBe('rgba(0, 0, 0, 0)');
	expect(
		await page.evaluate(() => getComputedStyle(document.querySelector('rect.band')!).userSelect)
	).toBe('none');
});

test('a reload keeps the view and drops the picks, on every page', async ({ page }) => {
	await page.goto('/transactions?month=2025-08&category=Grocery');
	await page.goto('/analytics/year?scope=year&month=2025-09&span=5');

	await page.reload();
	await expect(page).toHaveURL(/\/analytics\/year$/);
	await expect(page.getByRole('tab', { name: 'Yearly', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);

	await pages(page).getByRole('link', { name: 'Transactions', exact: true }).click();
	await expect(page).toHaveURL(/\/transactions$/);
	await pages(page).getByRole('link', { name: 'Analytics', exact: true }).click();
	await expect(page).toHaveURL(/\/analytics\/year$/);
});

test('a deep link opens its page directly', async ({ page }) => {
	await page.goto('/manage');
	await expect(page.getByRole('heading', { level: 2, name: 'Manage', exact: true })).toBeVisible();
});

test('a normal build hides the development gallery', async ({ page }) => {
	await expect(page.getByRole('link', { name: 'Development' })).toHaveCount(0);
	await page.goto('/dev');
	await expect(page.getByText('Not found')).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: 'Development', exact: true })
	).toHaveCount(0);
});

test('the theme toggle sits on the page title line', async ({ page }) => {
	const header = page.locator('.viewhead');
	await expect(header.getByRole('button', { name: /Switch to (light|dark) theme/ })).toBeVisible();
});

test('a narrow window folds the sidebar into the menu', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 900 });
	await settle(page);
	await expect(pages(page)).toHaveCount(0);

	await page.getByRole('button', { name: 'Open menu' }).click();
	for (const label of PAGE_LABELS) {
		await expect(pages(page).getByRole('link', { name: label, exact: true })).toBeVisible();
	}
});
