// The app shell: one route per page, the focus month carried between them, and history that undoes a step.

import { expect, test, type Page } from '@playwright/test';
import { openApp, PAGE_LABELS, settle, showPage } from './app';

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
	await expect(page.getByRole('heading', { level: 2, name: 'Transactions' })).toBeVisible();
	await page.goForward();
	await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('the focus month carries over to the next page', async ({ page }) => {
	await page.goto('/cash-flow?month=2025-09&view=year');
	await pages(page).getByRole('link', { name: 'Transactions', exact: true }).click();
	await expect(page).toHaveURL(/\/transactions\?month=2025-09$/);
});

test('a deep link opens its page directly', async ({ page }) => {
	await page.goto('/manage');
	await expect(page.getByRole('heading', { level: 2, name: 'Manage' })).toBeVisible();
});

test('the development gallery opens inside the shell, like every other page', async ({ page }) => {
	await page
		.getByRole('navigation', { name: 'Tools' })
		.getByRole('link', { name: 'Development' })
		.click();
	await expect(page.getByRole('heading', { level: 2, name: 'Development' })).toBeVisible();
	await expect(pages(page)).toBeVisible();
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
