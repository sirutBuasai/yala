// The planning panel: a modal that draws CHARTS and carries sliders that redraw them. A chart in a panel
// has no pane to grow into and no board to fold, so it fails in ways a chart on a board cannot — it
// collapses to nothing, or the panel outgrows the screen and takes its scroll region with it.

import { expect, test, type Page } from '@playwright/test';
import { audit, openApp, settle, showTab, violations } from './app';

/** Sizes a panel of two panes has to survive: a roomy desktop, the width the panel stops being wide at,
    and a phone. */
const VIEWPORTS = [
	{ width: 1440, height: 1000 },
	{ width: 900, height: 800 },
	{ width: 390, height: 780 }
] as const;

async function openPlanning(page: Page): Promise<void> {
	await showTab(page, 'Net Worth', 'All time');
	await page.getByRole('button', { name: 'Adjust' }).click();
	await settle(page);
	await expect(page.locator('dialog.sheet')).toHaveAttribute('open', '');
}

/** Every figure the panel draws, with the box it was given. */
async function figures(page: Page) {
	return page.evaluate(() => {
		const panel = document.querySelector<HTMLElement>('dialog.sheet .panel')!;
		const p = panel.getBoundingClientRect();
		return {
			panel: {
				w: Math.round(p.width),
				h: Math.round(p.height),
				pastRight: Math.round(p.right - window.innerWidth),
				pastBottom: Math.round(p.bottom - window.innerHeight),
				left: Math.round(p.left),
				top: Math.round(p.top)
			},
			figures: [...panel.querySelectorAll<HTMLElement>('.figurebox')].map((el) => {
				const r = el.getBoundingClientRect();
				const svg = el.querySelector('svg.chart');
				const s = svg?.getBoundingClientRect();
				return {
					w: Math.round(r.width),
					h: Math.round(r.height),
					svgW: Math.round(s?.width ?? 0),
					svgH: Math.round(s?.height ?? 0),
					// A chart sized off its container reports a degenerate viewBox when the container is zero.
					viewBox: svg?.getAttribute('viewBox') ?? null
				};
			}),
			bullets: [...panel.querySelectorAll<HTMLElement>('.bul')].map((el) =>
				Math.round(el.getBoundingClientRect().height)
			)
		};
	});
}

test.beforeEach(async ({ page }) => openApp(page));

for (const size of VIEWPORTS) {
	test(`the planning panel and its charts hold together at ${size.width}px`, async ({ page }) => {
		await page.setViewportSize(size);
		await openPlanning(page);

		const { panel, figures: figs, bullets } = await figures(page);

		// The panel stays on screen: it is the scroll region for everything inside, so a panel hanging off
		// the viewport takes content with it that no scroll can reach.
		expect(panel.left).toBeGreaterThanOrEqual(0);
		expect(panel.top).toBeGreaterThanOrEqual(0);
		expect(panel.pastRight).toBeLessThanOrEqual(0);
		expect(panel.pastBottom).toBeLessThanOrEqual(0);

		// Every chart in the panel got a real box. Zero is the failure this guards: a figure in a panel takes
		// its height from a flex-resolved parent, which collapses far more readily than a pane does.
		expect(figs.length).toBeGreaterThan(0);
		for (const f of figs) {
			expect(f.w).toBeGreaterThan(0);
			expect(f.h).toBeGreaterThan(0);
			expect(f.svgW).toBeGreaterThan(0);
			expect(f.svgH).toBeGreaterThan(0);
			expect(f.viewBox).not.toMatch(/ 0 0$|^0 0 0/);
		}
		for (const h of bullets) expect(h).toBeGreaterThan(0);

		// And the board behind it is still intact.
		const found = await audit(page);
		expect(found.bleed.length + found.clipped.length, JSON.stringify(found)).toBe(0);
	});
}

test('the planning panel has no accessibility violations', async ({ page }) => {
	await openPlanning(page);
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('every pane of the planning panel can be reached by scrolling, not clipped away', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 700 });
	await openPlanning(page);

	// `paned` hands scrolling to the children, so each pane must own its overflow. A pane that clips
	// without scrolling is content the reader can never get to.
	const panes = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('dialog.sheet .panel .body > *')].map((el) => ({
			hidden: el.scrollHeight - el.clientHeight,
			scrolls: ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)
		}))
	);

	expect(panes.length).toBeGreaterThan(0);
	for (const pane of panes) {
		if (pane.hidden > 2) expect(pane.scrolls).toBe(true);
	}
});

test('a slider redraws the charts beside it rather than leaving them stale', async ({ page }) => {
	await openPlanning(page);

	// The projection needs a birth year to place a retirement year against; without one it draws an empty
	// plot, which is the state a ledger that has never set one opens in.
	const born = page.locator('dialog.sheet #plan-birth-year');
	await born.fill('1990');
	await born.press('Enter');
	await settle(page);

	const line = page.locator('dialog.sheet svg.chart path');
	await expect(line.first()).toBeAttached();
	// Every path together, not one of them: the chart draws the projection alongside the levels it is judged
	// against, and which of those an assumption moves is the projection's business, not this test's.
	const drawn = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('dialog.sheet svg.chart path')]
				.map((e) => e.getAttribute('d'))
				.join('|')
		);
	const before = await drawn();
	// Read off the value TEXT, not the bar's width: a reading already past its target pegs the bar at full,
	// so a capped mark that is working cannot move — the figure it announces is what changes.
	const bars = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('dialog.sheet .bul .track')].map((el) =>
				el.getAttribute('aria-valuetext')
			)
		);
	const barsBefore = await bars();

	// The return is what compounds the balance, so it is the one that moves the projected path — the
	// withdrawal rate sets the TARGET the bars are read against instead. By keyboard, which is also the
	// assertion that the control is operable without a pointer.
	await page.getByRole('slider', { name: 'Expected nominal return' }).focus();
	for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
	await settle(page);
	expect(await drawn()).not.toBe(before);

	await page.getByRole('slider', { name: 'Withdrawal rate' }).focus();
	for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
	await settle(page);
	expect(await bars()).not.toEqual(barsBefore);

	// The redraw must not cost the panel its shape.
	const { panel, figures: figs } = await figures(page);
	expect(panel.pastBottom).toBeLessThanOrEqual(0);
	for (const f of figs) expect(f.svgH).toBeGreaterThan(0);
});
