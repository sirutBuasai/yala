// Shared harness: serve the app the fixture snapshot, move between its pages, and read the audit back.

import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditPage, type Audit } from './audit';
import { PAGES } from '../src/lib/nav/pages';

/**
 * Built from the ledger fixture, so the suite never reads the private ledger. Regenerate with:
 *
 *     YALA_LEDGER_DIR=apps/api/tests/fixtures/ledger-networth \
 *       PYTHONPATH=apps/api/src python -m yala.builder apps/web/e2e/fixtures/data.json
 */
const SNAPSHOT = readFileSync(
	fileURLToPath(new URL('./fixtures/data.json', import.meta.url)),
	'utf8'
);

/** Also fails on an uncaught page error: Svelte's loop guard stops a self-retriggering effect with only a
    page error while the page renders fine. */
export const test = base.extend<{ noPageErrors: void }>({
	noPageErrors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (e) => errors.push(e.message));
			await use();
			expect(errors, errors.join('\n')).toEqual([]);
		},
		{ auto: true }
	]
});

export const PAGE_LABELS = PAGES.map((p) => p.label);

/** Pages with a board, which the board suites (charts, steady, arrange) run against. */
export const BOARD_PAGES = [
	'Dashboard',
	'Transactions',
	'Analytics',
	'Accounts',
	'Planning'
] as const;

/** Content widths worth checking: either side of both fold thresholds, and the phone floor. */
export const WIDTHS = [320, 390, 480, 700, 960, 1000, 1200, 1392] as const;

/** Routes are intercepted, not a file written, so a run can't disturb the served snapshot; `/api/data` fails
    on purpose to put the app in read-only mode. */
export async function openApp(page: Page): Promise<void> {
	await page.route('**/api/data', (route) => route.fulfill({ status: 500, body: 'no api' }));
	await page.route('**/data.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT })
	);
	await page.goto('/');
	// Once per test, before the app's first script: a clear on every load wiped what a reload is meant to keep.
	await page.addInitScript(() => {
		if (sessionStorage.getItem('e2e-fresh')) return;
		localStorage.clear();
		sessionStorage.setItem('e2e-fresh', '1');
	});
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator('#page')).toBeVisible();
}

/** Open a page from the sidebar, or from the menu sheet when the window is too narrow for it. */
export async function showPage(page: Page, label: string): Promise<void> {
	// A resize just before this is only applied on the next frame, which decides sidebar or sheet.
	await settle(page, 2);
	const nav = page.getByRole('navigation', { name: 'Pages' });
	if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Open menu' }).click();
	await nav.getByRole('link', { name: label, exact: true }).click();
	await expect(page.getByRole('heading', { level: 2, name: label, exact: true })).toBeVisible();
	// Off the rail, which stays open under a resting pointer: Firefox checks a click's target without
	// moving the pointer first, so the open rail took every click near the page's left edge.
	const view = page.viewportSize();
	if (view) await page.mouse.move(view.width - 2, 2);
	await settle(page);
}

/** One of a Year view's span tabs. */
export function spanTab(page: Page, name: string): Locator {
	return page.getByRole('tablist', { name: 'Years shown' }).getByRole('tab', { name, exact: true });
}

/** Open the Add entry modal from the first pane that offers one. */
export async function openAdd(page: Page): Promise<void> {
	await page.getByRole('button', { name: '+ Add', exact: true }).first().click();
	await settle(page);
}

/** Let the pane measurements, which run on rAF and a ResizeObserver, come to rest. */
export async function settle(page: Page, frames = 12): Promise<void> {
	await page.evaluate(async (n) => {
		for (let i = 0; i < n; i++) {
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		}
	}, frames);
}

export async function audit(page: Page): Promise<Audit> {
	return page.evaluate(auditPage);
}

/** WCAG A/AA is the bar the palette was pitched against (see the contrast notes in app.css), and its colour
    rules are the ones a redesign is most likely to break silently. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Axe's findings, trimmed to what names the defect — the full report is thousands of lines. */
export async function violations(page: Page) {
	const { violations: found } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
	return found.map((v) => ({
		id: v.id,
		impact: v.impact,
		help: v.help,
		nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5)
	}));
}

/** What every fold and container query reads, without a real viewport resize per step. Null releases it. */
export async function setContentWidth(page: Page, px: number | null): Promise<void> {
	await page.evaluate((w) => {
		const wrap = document.querySelector<HTMLElement>('.wrap')!;
		wrap.style.width = w === null ? '' : `${w}px`;
		wrap.style.maxWidth = w === null ? '' : `${w}px`;
	}, px);
	await settle(page);
}

/** Turn the board's arrange affordances on, if this width offers them. */
export async function startArranging(page: Page): Promise<void> {
	if (await page.locator('.grab').first().isVisible()) return;
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await settle(page);
	await expect(page.locator('.grab').first()).toBeVisible();
}

/** Stepped, since the gesture begins only past its threshold. */
export async function dragBy(handle: Locator, dx: number, dy: number, steps = 6): Promise<void> {
	await handle.evaluate(
		async (node: Element, { dx, dy, steps }) => {
			const box = node.getBoundingClientRect();
			const [x, y] = [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
			const send = async (type: string, px: number, py: number) => {
				node.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						cancelable: true,
						clientX: px,
						clientY: py,
						button: 0,
						buttons: type === 'pointerup' ? 0 : 1,
						pointerId: 7,
						isPrimary: true
					})
				);
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			};
			await send('pointerdown', x, y);
			for (let i = 1; i <= steps; i++)
				await send('pointermove', x + (dx * i) / steps, y + (dy * i) / steps);
			await send('pointerup', x + dx, y + dy);
		},
		{ dx, dy, steps }
	);
	await settle(handle.page());
}

/** One arrange gesture or control press, picked from what the board currently offers. */
export const GESTURES = ['move', 'resize', 'split', 'merge', 'height'] as const;
export type Gesture = (typeof GESTURES)[number];

const TARGET: Record<Gesture, string> = {
	move: '.cell > .grab',
	resize: '.cell > .handle',
	split: '.cut',
	merge: '.join',
	height: '.modebtn'
};

/** False when the board offers none, which is not a failure. */
export async function doGesture(
	page: Page,
	gesture: Gesture,
	pick: (count: number) => number,
	travel: () => number
): Promise<boolean> {
	const targets = page.locator(TARGET[gesture]);
	const count = await targets.count();
	if (count === 0) return false;
	const target = targets.nth(pick(count));
	if (gesture === 'move' || gesture === 'resize') await dragBy(target, travel(), travel());
	else {
		await target.click();
		await settle(page);
	}
	return true;
}

/** Everything the audit found, as one message a failure can be read from. */
export function report(where: string, found: Audit): string {
	const lines = [
		...found.bleed.map((b) => `bleed ${b.by}px out of "${b.card}": ${b.el}`),
		...found.clipped.map((c) => `clipped label (dx ${c.dx}, dy ${c.dy}): ${c.el}`),
		...found.overlap.map((o) => `cards overlap: ${o.a} / ${o.b}`)
	];
	return `${where}\n  ${lines.join('\n  ')}`;
}

export function expectClean(where: string, found: Audit): void {
	expect(
		found.bleed.length + found.clipped.length + found.overlap.length,
		report(where, found)
	).toBe(0);
}
