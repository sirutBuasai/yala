// The nav drawer as a modal: what the platform now owes us.

import { expect, test } from '@playwright/test';
import { openApp, settle } from './app';

test.beforeEach(async ({ page }) => openApp(page));

test('the nav drawer opens as a real modal and hands focus back on Escape', async ({ page }) => {
	// Narrow enough that the sidebar folds into the sheet.
	await page.setViewportSize({ width: 900, height: 900 });
	const burger = page.getByRole('button', { name: 'Open menu' });
	await burger.click();
	await settle(page);

	const sheet = page.locator('dialog.sheet');
	await expect(sheet).toHaveAttribute('open', '');
	// Not the dismiss button: opening a panel should not announce "close".
	await expect(page.getByRole('link', { name: 'Dashboard' })).toBeFocused();

	// The page behind is inert — asserted through its effect, since inertness has no attribute to read.
	for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
	expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);

	await page.keyboard.press('Escape');
	await settle(page, 24);
	await expect(page.locator('dialog.sheet')).toHaveCount(0);
	await expect(burger).toBeFocused();
});
