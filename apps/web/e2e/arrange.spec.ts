// The board under abuse: random gestures and pathological labels, auditing after every one.

import { expect, test, type Page } from '@playwright/test';
import {
	audit,
	dragBy,
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
	['Activity', 64],
	['Net Worth', 97]
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

// A merged card's sections share one rectangle, so every limit that holds for a card has to hold for a
// section of one: the room a section is handed is its weighted share, which can be less than its content.
test.describe("a merged card's sections", () => {
	/** Home's KPI strip: three sections sharing one row, the shape where they compete for width. */
	async function strip(page: Page) {
		await showTab(page, 'Home');
		await startArranging(page);
		const cell = page.locator('.cell:has(.sections)').first();
		await expect(cell.locator('.section')).toHaveCount(3);
		return cell;
	}

	const spans = (page: Page) =>
		page.evaluate(
			() =>
				JSON.parse(localStorage.getItem('yala-board-home-2') ?? '[]').find(
					(p: { id: string }) => p.id === 'income'
				)?.w as number
		);

	test('grow the card to hold a long title, and stop it at what the card can hold', async ({
		page
	}) => {
		const cell = await strip(page);
		const before = await spans(page);

		await cell.locator('.editable[aria-label*="rename title"]').nth(1).click();
		await page.locator('[aria-label="Rename title"]').pressSequentially(LONG_WORDS);
		await page.keyboard.press('Enter');
		await settle(page, 24);

		expect(await spans(page)).toBeGreaterThan(before);
		// Shorter than asked for: the card ran out of grid before the words ran out.
		const shown = await cell.locator('.kpi h2').nth(1).innerText();
		expect(shown.length).toBeLessThan(LONG_WORDS.length);
		expectClean('after a long title in a merged section', await audit(page));
	});

	test('refuse a resize that would squeeze a section rather than clip it', async ({ page }) => {
		const cell = await strip(page);
		await cell.locator('.editable[aria-label*="rename title"]').nth(1).click();
		await page.locator('[aria-label="Rename title"]').pressSequentially(LONG_WORDS);
		await page.keyboard.press('Enter');
		await settle(page, 24);

		// The card is now as narrow as its widest section allows, so there is nothing left to give up.
		const grown = await spans(page);
		await dragBy(cell.locator('.handle.e'), -700, 0);
		expect(await spans(page)).toBe(grown);
		expectClean('after a refused resize', await audit(page));
	});

	// Growth is bounded by the grid, not by a pass count. Budgeted, only the leftmost section reached the
	// edge — its overrun propagates across the whole card and so reports the full shortfall at once, while
	// its neighbours, which receive a share of each pass, ran out of passes part way.
	test('reach the same limit whichever section is being typed into', async ({ page }) => {
		const reached: number[] = [];
		for (const nth of [0, 1, 2]) {
			await openApp(page);
			const cell = await strip(page);
			await cell.locator('.editable[aria-label*="rename title"]').nth(nth).click();
			await page.locator('[aria-label="Rename title"]').pressSequentially('W'.repeat(40));
			await page.keyboard.press('Enter');
			await settle(page, 24);
			reached.push((await cell.locator('.kpi h2').nth(nth).innerText()).length);
			expectClean(`after filling section ${nth}`, await audit(page));
		}
		// Within a character or two of each other; a section that stopped early would be far short.
		expect(Math.max(...reached) - Math.min(...reached)).toBeLessThanOrEqual(3);
	});

	test('carry a long title through a split and back through a merge', async ({ page }) => {
		const cell = await strip(page);
		await cell.locator('.editable[aria-label*="rename title"]').nth(1).click();
		await page.locator('[aria-label="Rename title"]').pressSequentially(LONG_WORDS);
		await page.keyboard.press('Enter');
		await settle(page, 24);
		const title = await cell.locator('.kpi h2').nth(1).innerText();

		await page.locator('.cut').first().click();
		await settle(page, 24);
		expectClean('after splitting a section carrying a long title', await audit(page));

		// A merge shares the inherited width out by weight, so a section can be handed less than it holds.
		await page.locator('.join').first().click();
		await settle(page, 28);
		expectClean('after merging one back in', await audit(page));
		expect(await page.locator('.kpi h2').nth(1).innerText()).toBe(title);
	});
});
