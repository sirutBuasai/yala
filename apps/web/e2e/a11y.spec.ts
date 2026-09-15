// axe over every board, in both themes, and over an open modal. WCAG A/AA is the bar the palette was
// pitched against (see the contrast notes in app.css), and its colour rules are the ones a redesign is
// most likely to break silently.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp, settle, showTab, TABS } from './app';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violations(page: Page) {
	const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	return violations.map((v) => ({
		id: v.id,
		impact: v.impact,
		help: v.help,
		nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5)
	}));
}

test.beforeEach(async ({ page }) => openApp(page));

for (const tab of TABS) {
	test(`${tab} has no accessibility violations`, async ({ page }) => {
		await showTab(page, tab);
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
