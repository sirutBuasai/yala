// The transaction form's pending boxes. Awaiting a reimbursement qualifies Pending, so its box sits beside
// Pending, or directly under it when Pending's cell is too narrow for both, never in a grid cell of its own.

import { expect, test, type Locator } from '@playwright/test';
import { openApp, settle, showTab, violations } from './app';

test.beforeEach(async ({ page }) => openApp(page));

/** Phone floor, a large phone, a tablet, and the desktop the suite runs at. */
const VIEWPORTS = [
	{ width: 320, height: 800 },
	{ width: 390, height: 844 },
	{ width: 768, height: 1000 },
	{ width: 1440, height: 1000 }
];

const boxOf = async (checkbox: Locator) => (await checkbox.locator('xpath=..').boundingBox())!;

for (const size of VIEWPORTS) {
	test(`the reimbursement box sits with Pending at ${size.width}px`, async ({ page }) => {
		await page.setViewportSize(size);
		await showTab(page, 'Activity');
		await page.getByRole('button', { name: '+ Add entry' }).click();
		await settle(page);

		const dialog = page.locator('dialog');
		const pending = dialog.getByLabel('Pending', { exact: true });
		const awaiting = dialog.getByLabel('Awaiting reimbursement');
		await expect(awaiting).toHaveCount(0);

		await pending.check();
		await expect(awaiting).toBeVisible();

		const p = await boxOf(pending);
		const a = await boxOf(awaiting);
		const beside = Math.abs(a.y - p.y) < 2 && a.x >= p.x + p.width;
		const under = Math.abs(a.x - p.x) < 2 && a.y >= p.y + p.height;
		expect(beside || under).toBe(true);

		// The next tab stop after Pending, and operable from the keyboard.
		await pending.focus();
		await page.keyboard.press('Tab');
		await expect(awaiting).toBeFocused();
		await page.keyboard.press('Space');
		await expect(awaiting).toBeChecked();

		const found = await violations(page);
		expect(found, JSON.stringify(found, null, 2)).toEqual([]);
	});
}
