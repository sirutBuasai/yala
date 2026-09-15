// The board under abuse: random gestures and pathological labels, auditing after every one.

import { expect, test } from '@playwright/test';
import {
	audit,
	doGesture,
	expectClean,
	GESTURES,
	openApp,
	settle,
	showTab,
	startArranging
} from './app';

/** Long enough to outgrow any card, in both the shapes that behave differently: breakable and not. */
const LONG_WORDS =
	'Quarterly discretionary spending against the rolling twelve month average and more';
const LONG_RUN = 'W'.repeat(110);

test.beforeEach(async ({ page }) => openApp(page));

test('a pane grows for a long title and never shows it clipped', async ({ page }) => {
	await showTab(page, 'Home');
	await startArranging(page);

	for (const words of [LONG_WORDS, LONG_RUN]) {
		const label = page.locator('.editable[aria-label*="rename title"]').first();
		await label.click();
		const field = page.locator('[aria-label="Rename title"]');
		await field.pressSequentially(words);
		await page.keyboard.press('Enter');
		await settle(page, 20);
		expectClean(`after renaming a title to ${words.length} chars`, await audit(page));
	}
});

test('a caption on a card that cannot grow is refused rather than stored clipped', async ({
	page
}) => {
	await showTab(page, 'Home');
	await startArranging(page);

	// A pane with no room left to take is the case the editor's single revert has to get right.
	const caption = page.locator('.editable[aria-label*="rename caption"]').last();
	await caption.click();
	await page.locator('[aria-label="Rename caption"]').pressSequentially(LONG_RUN);
	await page.keyboard.press('Enter');
	await settle(page, 20);

	expectClean('after renaming a caption on a full-width card', await audit(page));
});

test('moving straight from one card label to another sizes only the pane being typed into', async ({
	page
}) => {
	await showTab(page, 'Home');
	await startArranging(page);

	// No blur in between, so the first pane's measurement is still resolving when the second opens.
	const labels = page.locator('.editable[aria-label*="rename title"]');
	await labels.nth(0).click();
	await page.locator('[aria-label="Rename title"]').pressSequentially('First');
	await labels.nth(1).click();
	await page.locator('[aria-label="Rename title"]').pressSequentially(LONG_RUN);
	await page.keyboard.press('Enter');
	await settle(page, 20);

	expectClean('after moving between two labels', await audit(page));
});

/** Deterministic, so a failure names the exact sequence that produced it. */
function random(seed: number) {
	let state = seed;
	return () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

for (const [tab, seed] of [
	['Home', 31],
	['Activity', 64]
] as const) {
	test(`${tab} survives 30 random gestures (seed ${seed})`, async ({ page }) => {
		await showTab(page, tab);
		await startArranging(page);

		const rand = random(seed);
		for (let step = 0; step < 30; step++) {
			const gesture = GESTURES[Math.floor(rand() * GESTURES.length)]!;
			const done = await doGesture(
				page,
				gesture,
				(count) => Math.floor(rand() * count),
				() => Math.round((rand() - 0.5) * 800)
			);
			if (done) expectClean(`${tab} seed ${seed}, step ${step} (${gesture})`, await audit(page));
		}
	});
}

test('merging and splitting a KPI card returns it to exactly its former size', async ({ page }) => {
	await showTab(page, 'Activity');
	await startArranging(page);

	const board = () => page.evaluate(() => localStorage.getItem('yala-board-activity:month-2'));
	const before = await board();

	// A rounding error banked into either half grows the card a little on every cycle.
	for (let i = 0; i < 3; i++) {
		await page.locator('.cut').first().click();
		await settle(page);
		await page.locator('.join').first().click();
		await settle(page);
	}

	expect(await board()).toBe(before);
	expectClean('after three merge/split cycles', await audit(page));
});
