// Every typed entry must land inside the bounds, since one out-of-range figure makes every projection wrong.

import { expect, type Locator, type Page } from '@playwright/test';
import { openApp, settle, showPage, test } from './app';

const openPlanning = (page: Page) => showPage(page, 'Planning');

/** The bounds a control was drawn from, read off the control itself rather than assumed here: they come
    from a backend spec, and a test that restated them would only be testing its own copy. */
async function boundsOf(field: Locator) {
	const [min, max] = await Promise.all([
		field.getAttribute('aria-valuemin'),
		field.getAttribute('aria-valuemax')
	]);
	return { min: Number(min), max: Number(max) };
}

/** Type `text` into the reading and commit it the way a user does. */
async function enter(field: Locator, text: string): Promise<void> {
	await field.click();
	await field.press('ControlOrMeta+a');
	await field.fill(text);
	await field.press('Enter');
	await settle(field.page());
}

const reading = (page: Page) => page.locator('[data-pane] input.num');

test.beforeEach(async ({ page }) => openApp(page));

test('holds every reading to its own bounds, whatever is typed in', async ({ page }) => {
	await openPlanning(page);
	const fields = reading(page);
	const count = await fields.count();
	expect(count).toBeGreaterThan(0);

	for (let i = 0; i < count; i++) {
		const field = fields.nth(i);
		const { min, max } = await boundsOf(field);
		const label = await field.getAttribute('aria-label');
		// A field that may be unset says so with its placeholder, and empties to unset instead of its floor.
		const optional = (await field.getAttribute('placeholder')) !== null;
		const unreadable = optional ? null : String(min);

		// Far past the ceiling, and a figure no field is sized for.
		await enter(field, String(max * 1000 + 999));
		expect(Number(await field.getAttribute('aria-valuenow')), `${label} over max`).toBe(max);

		// Below the floor, including a sign no bounded figure here accepts.
		await enter(field, String(-Math.abs(max) - 1));
		expect(Number(await field.getAttribute('aria-valuenow')), `${label} under min`).toBe(min);

		// Emptied, which a bounded field can only read as its floor.
		await enter(field, '');
		expect(await field.getAttribute('aria-valuenow'), `${label} emptied`).toBe(unreadable);

		// Not a number at all.
		await enter(field, 'not a number');
		expect(await field.getAttribute('aria-valuenow'), `${label} junk`).toBe(unreadable);
	}
});

test('takes a figure back with its thousands separators still in it', async ({ page }) => {
	await openPlanning(page);
	// A control whose values are large enough to be grouped at rest.
	const field = page.getByRole('spinbutton', { name: 'Planned spending' });
	const { min, max } = await boundsOf(field);
	const target = Math.min(max, Math.max(min, 12345));

	await enter(field, target.toLocaleString());
	expect(Number(await field.getAttribute('aria-valuenow'))).toBe(target);
});

test('a rejected entry leaves the control showing the value it settled on', async ({ page }) => {
	await openPlanning(page);
	const field = reading(page).first();
	const { max } = await boundsOf(field);

	await enter(field, String(max * 99));

	// The field must not keep the text it refused: shown and announced have to agree, or the reader is
	// looking at a figure the charts are not drawn from.
	const shown = Number((await field.inputValue()).replace(/,/g, ''));
	expect(shown).toBe(max);
	expect(Number(await field.getAttribute('aria-valuenow'))).toBe(max);
});

test('an out-of-range entry never breaks the layout it sits in', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 800 });
	await openPlanning(page);
	const field = reading(page).first();

	// Far more digits than the field was sized for (`widest` is drawn from the BOUNDS, not from what can be
	// typed), so this is the case where a fixed-width box meets arbitrary input.
	await field.click();
	await field.fill('9'.repeat(40));
	await settle(page);

	const mid = await page.evaluate(() => {
		const panel = document.querySelector<HTMLElement>('[data-pane="market"]')!;
		const p = panel.getBoundingClientRect();
		const row = panel.querySelector<HTMLElement>('.numfield')!;
		const r = row.getBoundingClientRect();
		return {
			pastRight: Math.round(p.right - window.innerWidth),
			rowPastPanel: Math.round(r.right - p.right)
		};
	});
	expect(mid.pastRight).toBeLessThanOrEqual(0);
	expect(mid.rowPastPanel).toBeLessThanOrEqual(0);

	// Committing brings it back to the ceiling.
	await field.press('Enter');
	await settle(page);
	const { max } = await boundsOf(field);
	expect(Number(await field.getAttribute('aria-valuenow'))).toBe(max);
});

test('is operable from the keyboard alone, within its bounds', async ({ page }) => {
	await openPlanning(page);
	const field = reading(page).first();
	const { min, max } = await boundsOf(field);
	const now = async () => Number(await field.getAttribute('aria-valuenow'));

	await field.focus();
	// Well past the ceiling in steps: the control itself must stop at it.
	for (let i = 0; i < 200; i++) await page.keyboard.press('ArrowUp');
	await settle(page);
	expect(await now()).toBe(max);

	for (let i = 0; i < 400; i++) await page.keyboard.press('ArrowDown');
	await settle(page);
	expect(await now()).toBe(min);
});

test('typing into a field just focused replaces its reading rather than adding to it', async ({
	page
}) => {
	await openPlanning(page);
	// A grouped figure: focusing drops the separators, which once landed after the browser's selection,
	// so the typed digits were appended and the reading ran to the maximum.
	const field = page.getByRole('spinbutton', { name: 'Planned spending' });
	for (const entry of ['40000', '41000']) {
		await field.fill(entry);
		await field.press('Enter');
		await settle(page);
		expect(Number(await field.getAttribute('aria-valuenow'))).toBe(Number(entry));
	}
	await field.focus();
	await page.keyboard.type('42000');
	await page.keyboard.press('Enter');
	await settle(page);
	expect(Number(await field.getAttribute('aria-valuenow'))).toBe(42000);
});
