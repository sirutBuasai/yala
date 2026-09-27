// Manage reopens on the account last worked on, through a reload and a trip to another page.

import { expect } from '@playwright/test';
import { openApp, settle, showPage, test } from './app';

test.beforeEach(async ({ page }) => openApp(page));

test('the selected account is kept through a reload and a page switch', async ({ page }) => {
	await showPage(page, 'Manage');
	await page.locator('.group > .head').first().click();
	const account = page.locator('button.acct').first();
	const name = (await account.textContent())!.trim();
	await account.click();
	const selected = page.locator('button.acct[aria-current="true"]');
	await expect(selected).toHaveText(name);

	await page.reload();
	await settle(page);
	await expect(selected).toHaveText(name);

	await showPage(page, 'Dashboard');
	await showPage(page, 'Manage');
	await expect(selected).toHaveText(name);
});
