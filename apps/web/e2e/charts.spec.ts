// Every chart the boards actually draw, one at a time: the box it was given, the frame it drew into, and
// the name it answers to. A chart that collapses to nothing still passes a bleed probe — there is no ink
// to escape — so its geometry has to be asserted on its own.

import { expect, test, type Page } from '@playwright/test';
import { openApp, RANGES, setContentWidth, settle, showTab, TABS } from './app';

/** Either side of the fold, which is where a chart's box comes from a different rule. */
const WIDTHS = [1392, 700] as const;

interface Drawn {
	/** How the chart identifies itself in the DOM, since `Figure` renders the component bare. */
	kind: string;
	name: string | null;
	/** Hidden from assistive tech on purpose, which is only allowed where the same data is beside it as
	    text (as the donut's legend is). */
	hidden: boolean;
	/** Text alternatives inside the same card. */
	alt: number;
	w: number;
	h: number;
	/** How far the drawing reaches outside the box it was given. */
	outX: number;
	outY: number;
	viewBox: string | null;
	card: string;
}

async function drawn(page: Page): Promise<Drawn[]> {
	return page.evaluate(() => {
		const named = (el: Element): string => {
			if (el.matches('svg.chart')) return 'svg';
			if (el.matches('.bullets')) return 'bullet';
			if (el.matches('.matrix')) return 'matrix';
			return 'table';
		};
		const out: Drawn[] = [];
		for (const card of document.querySelectorAll('.card')) {
			const title = (card.querySelector('h2')?.textContent ?? '?').trim().slice(0, 30);
			for (const el of card.querySelectorAll('svg.chart, .bullets, .matrix, .tablebox table')) {
				const r = el.getBoundingClientRect();
				// The box the chart was handed, which is what it is supposed to fit.
				const host = el.closest('.figurebox, .sizebox, .matrixbox, .body') ?? card;
				const h = host.getBoundingClientRect();
				out.push({
					kind: named(el),
					name: el.getAttribute('aria-label'),
					hidden: el.closest('[aria-hidden="true"]') !== null,
					alt: card.querySelectorAll('.legend-list li, table tbody tr, .bul').length,
					w: Math.round(r.width),
					h: Math.round(r.height),
					outX: Math.round(Math.max(0, r.right - h.right, h.left - r.left)),
					outY: Math.round(Math.max(0, r.bottom - h.bottom, h.top - r.top)),
					viewBox: el.getAttribute('viewBox'),
					card: title
				});
			}
		}
		return out;
	});
}

test.beforeEach(async ({ page }) => openApp(page));

for (const tab of TABS) {
	for (const range of RANGES[tab] ?? [undefined]) {
		const board = range ? `${tab} · ${range}` : tab;
		test(`every chart on ${board} is drawn a real box it stays inside`, async ({ page }) => {
			await showTab(page, tab, range);

			for (const width of WIDTHS) {
				await setContentWidth(page, width);
				const charts = await drawn(page);

				for (const c of charts) {
					const where = `${board} at ${width}px — ${c.kind} in "${c.card}"`;
					// Collapsed to nothing is the failure a bleed probe cannot see.
					expect(c.w, `${where}: no width`).toBeGreaterThan(0);
					expect(c.h, `${where}: no height`).toBeGreaterThan(0);
					// A scroller is allowed to be wider than its window; nothing may overflow vertically.
					expect(c.outY, `${where}: ${c.outY}px past its box`).toBeLessThanOrEqual(2);
					if (c.viewBox) {
						const [, , vw, vh] = c.viewBox.split(/[ ,]+/).map(Number);
						expect(vw, `${where}: degenerate viewBox`).toBeGreaterThan(0);
						expect(vh, `${where}: degenerate viewBox`).toBeGreaterThan(0);
					}
				}
			}
			await setContentWidth(page, null);
		});
	}
}

test('every plotted chart is either named or replaced by text, never silently a picture', async ({
	page
}) => {
	// An unlabelled `role="img"` announces only "image". Hiding the drawing instead is allowed — and better
	// — but only where the same figures sit beside it as text.
	const silent: string[] = [];
	let seen = 0;

	for (const tab of TABS) {
		for (const range of RANGES[tab] ?? [undefined]) {
			await showTab(page, tab, range);
			await settle(page);
			for (const c of await drawn(page)) {
				if (c.kind !== 'svg') continue;
				seen++;
				const named = !!c.name?.trim();
				const spoken = c.hidden && c.alt > 0;
				if (!named && !spoken) silent.push(`${tab} ${range ?? ''} — "${c.card}"`);
			}
		}
	}

	expect(seen).toBeGreaterThan(0);
	expect(silent, silent.join('; ')).toEqual([]);
});
