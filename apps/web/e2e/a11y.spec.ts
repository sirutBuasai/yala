// axe over every page in both themes, a modal and a board being arranged: colour rules are what a redesign
// most likely breaks silently.

import { expect } from '@playwright/test';
import { openAdd, openApp, PAGE_LABELS, settle, showPage, test, violations } from './app';

test.beforeEach(async ({ page }) => openApp(page));

for (const label of PAGE_LABELS) {
	test(`${label} has no accessibility violations`, async ({ page }) => {
		await showPage(page, label);
		const found = await violations(page);
		expect(found, JSON.stringify(found, null, 2)).toEqual([]);
	});
}

test('the light theme has no accessibility violations', async ({ page }) => {
	await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).click();
	await settle(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('an open modal has no accessibility violations', async ({ page }) => {
	await showPage(page, 'Transactions');
	await openAdd(page);
	await settle(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('an open date picker has no accessibility violations', async ({ page }) => {
	await showPage(page, 'Transactions');
	await openAdd(page);
	await page.locator('dialog').getByRole('combobox', { name: 'Date' }).click();
	await settle(page);
	await expect(page.locator('dialog').getByRole('grid')).toBeVisible();
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('a board being arranged has no accessibility violations', async ({ page }) => {
	await showPage(page, 'Transactions');
	await page.getByRole('button', { name: 'Edit' }).click();
	await settle(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});
