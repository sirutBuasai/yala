// Nothing a card holds may paint outside it, and no label may be cut off, at any width the app folds to.

import { test } from '@playwright/test';
import { audit, expectClean, openApp, setContentWidth, showTab, TABS, WIDTHS } from './app';

test.beforeEach(async ({ page }) => openApp(page));

for (const tab of TABS) {
	test(`${tab} contains its content at every width`, async ({ page }) => {
		await showTab(page, tab);
		for (const width of WIDTHS) {
			await setContentWidth(page, width);
			expectClean(`${tab} at ${width}px`, await audit(page));
		}
		await setContentWidth(page, null);
	});
}

test('the calendar keeps one cell per weekday when it drops the week gutter', async ({ page }) => {
	await showTab(page, 'Home');
	await setContentWidth(page, 390);

	// The grid drops the gutter COLUMN at this width; its cells have to go with it.
	const shape = await page.evaluate(() => {
		const cal = document.querySelector('.cal')!;
		const columns = getComputedStyle(cal).gridTemplateColumns.split(' ').length;
		const weekCells = [...cal.querySelectorAll('.wkcell')].filter(
			(el) => getComputedStyle(el).display !== 'none'
		).length;
		const tops = new Set(
			[...cal.querySelectorAll('.cell:not(.blank)')].map((c) =>
				Math.round(c.getBoundingClientRect().top)
			)
		);
		return { columns, weekCells, rows: tops.size };
	});

	test.expect(shape.weekCells).toBe(0);
	test.expect(shape.columns).toBe(7);
	// A month spans five or six weeks; a cascade gives one row per DAY.
	test.expect(shape.rows).toBeLessThanOrEqual(6);
});
