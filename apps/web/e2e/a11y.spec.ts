// axe over every page, in both themes. WCAG A/AA is the bar the palette was
// pitched against (see the contrast notes in app.css), and its colour rules are the ones a redesign is
// most likely to break silently.

import { expect, test } from '@playwright/test';
import { openApp, PAGE_LABELS, settle, showPage, violations } from './app';

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
