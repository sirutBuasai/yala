// axe over every board, in both themes, and over an open modal. WCAG A/AA is the bar the palette was
// pitched against (see the contrast notes in app.css), and its colour rules are the ones a redesign is
// most likely to break silently.

import { expect, test } from '@playwright/test';
import { openApp, RANGES, settle, showTab, TABS, violations } from './app';

test.beforeEach(async ({ page }) => openApp(page));

for (const tab of TABS) {
	for (const range of RANGES[tab] ?? [undefined]) {
		const board = range ? `${tab} · ${range}` : tab;
		test(`${board} has no accessibility violations`, async ({ page }) => {
			await showTab(page, tab, range);
			const found = await violations(page);
			expect(found, JSON.stringify(found, null, 2)).toEqual([]);
		});
	}
}

test('the light theme has no accessibility violations', async ({ page }) => {
	await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).click();
	await settle(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('an open modal has no accessibility violations', async ({ page }) => {
	await showTab(page, 'Activity');
	await page.getByRole('button', { name: '+ Add entry' }).click();
	await settle(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('a board being arranged has no accessibility violations', async ({ page }) => {
	await page.getByRole('button', { name: 'Edit' }).click();
	await settle(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});
