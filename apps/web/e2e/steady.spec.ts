// A board looks the same whatever date it is showing, and only Edit mode may change that.
//
// The defect this guards against: a pane that measured its own content and grew to fit it wrote the bigger
// rectangle to storage, so whichever period happened to carry the longest figures re-arranged the board for
// every other period — and for every later visit.

import { expect, test, type Page } from '@playwright/test';
import { audit, expectClean, openApp, RANGES, settle, showTab, TABS, type Tab } from './app';

interface Cell {
	x: number;
	w: number;
	y: number;
	h: number;
	/** A list pane the user put on a content-following height (see `grid/sizing`). */
	follows: boolean;
	name: string;
}

const cells = (page: Page): Promise<Cell[]> =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('.board > .cell')].map((el) => {
			const span = (s: string) => {
				const m = s.match(/^(\d+)\s*\/\s*span\s*(\d+)$/);
				return m ? [Number(m[1]), Number(m[2])] : [0, 0];
			};
			const [x, w] = span(el.style.gridColumn);
			const [y, h] = span(el.style.gridRow);
			const kpi = [...el.querySelectorAll('.kpi h2')].map((n) => n.textContent!.trim());
			const head = el.querySelector('.card h2, .card h3');
			return {
				x,
				w,
				y,
				h,
				follows: el.classList.contains('hug') || el.classList.contains('capped'),
				name: kpi.length ? `KPI[${kpi.join('|')}]` : (head?.textContent?.trim() ?? 'pane')
			};
		})
	);

/** Every board pane rectangle currently in storage — empty unless a gesture put one there. */
const stored = (page: Page): Promise<string[]> =>
	page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('yala-board-')));

/**
 * Same panes, same widths, same places. Height is compared too, except on a pane whose height mode is the
 * user's request to follow its content — the one thing a date is allowed to change.
 */
function expectSameLayout(where: string, base: Cell[], now: Cell[]): void {
	expect(now.length, `${where}: pane count`).toBe(base.length);
	for (const [i, cell] of now.entries()) {
		const was = base[i]!;
		const shape = (c: Cell) =>
			c.follows ? `${c.x},${c.w} @y${c.y}` : `${c.x},${c.w} @y${c.y} h${c.h}`;
		expect(shape(cell), `${where}: ${was.name}`).toBe(shape(was));
	}
}

/** Each date a picker offers, as the option values to select. */
async function dates(page: Page): Promise<{ year: string; months: string[] }[]> {
	const years = page.locator('select[aria-label="Year"]');
	if (!(await years.count())) return [];
	const out: { year: string; months: string[] }[] = [];
	for (const year of await years
		.first()
		.locator('option')
		.evaluateAll((o) => o.map((n) => (n as HTMLOptionElement).value))) {
		await years.first().selectOption(year);
		await settle(page);
		const months = page.locator('select[aria-label="Month"]');
		out.push({
			year,
			months: (await months.count())
				? await months
						.first()
						.locator('option')
						.evaluateAll((o) => o.map((n) => (n as HTMLOptionElement).value))
				: []
		});
	}
	return out;
}

test.beforeEach(async ({ page }) => openApp(page));

for (const tab of TABS) {
	for (const range of RANGES[tab] ?? [undefined]) {
		const board = `${tab}${range ? ` / ${range}` : ''}`;

		test(`${board} renders the same on every date`, async ({ page }) => {
			await showTab(page, tab, range);
			await settle(page);
			if (!(await page.locator('.board > .cell').count())) return;

			const base = await cells(page);
			expectClean(`${board} as opened`, await audit(page));

			for (const { year, months } of await dates(page)) {
				await page.locator('select[aria-label="Year"]').first().selectOption(year);
				await settle(page);
				for (const month of months.length ? months : [null]) {
					if (month) {
						await page.locator('select[aria-label="Month"]').first().selectOption(month);
						await settle(page);
					}
					const where = `${board} at ${month ?? year}`;
					expectSameLayout(where, base, await cells(page));
					expectClean(where, await audit(page));
				}
			}

			// Nothing but Edit mode may write a rectangle, and browsing is not Edit mode.
			expect(await stored(page), 'a board was stored by browsing').toEqual([]);
		});
	}
}

test('a reload, a popup and a narrower window leave every pane where it was', async ({ page }) => {
	await showTab(page, 'Activity', 'Month');
	await settle(page);
	const base = await cells(page);

	// The harness clears storage on every navigation, so this reopens the board from its declared defaults —
	// which is the comparison worth making: a reload must not land on a different arrangement.
	await page.reload();
	await showTab(page, 'Activity', 'Month');
	await settle(page);
	expectSameLayout('after a reload', base, await cells(page));

	// A form over the board must not move what is under it.
	const add = page.getByRole('button', { name: '+ Add' }).first();
	if (await add.count()) {
		await add.click();
		await settle(page);
		await page.keyboard.press('Escape');
		await settle(page);
		expectSameLayout('after opening and closing a form', base, await cells(page));
	}

	// Narrowed, but not past the fold: the grid is still the grid, so the rectangles must be untouched.
	await page.setViewportSize({ width: 1500, height: 1000 });
	await settle(page);
	expectSameLayout('at a narrower window', base, await cells(page));
	expectClean('at a narrower window', await audit(page));

	expect(await stored(page), 'a board was stored without a gesture').toEqual([]);
});
