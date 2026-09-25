// Shared harness: serve the app the fixture snapshot, move between its pages, and read the audit back.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditPage, type Audit } from './audit';
import { PAGES } from '../src/lib/nav/pages';

/**
 * Built from the ledger fixture, so the suite runs anywhere and never reads the private ledger.
 * Regenerate with:
 *
 *     YALA_LEDGER_DIR=apps/api/tests/fixtures/ledger-networth \
 *       PYTHONPATH=apps/api/src python -m yala.builder apps/web/e2e/fixtures/data.json
 *
 * `ledger-networth` is the shared fixture plus logged balances; see its own main.beancount for why the
 * balances cannot live in `ledger/`.
 */
const SNAPSHOT = readFileSync(
	fileURLToPath(new URL('./fixtures/data.json', import.meta.url)),
	'utf8'
);

export const PAGE_LABELS = PAGES.map((p) => p.label);

/** Content widths worth checking: either side of both fold thresholds, and the phone floor. */
export const WIDTHS = [320, 390, 480, 700, 960, 1000, 1200, 1392] as const;

/**
 * Open the app on the fixture snapshot with no stored preferences. Routes are intercepted rather than a
 * file written, so a run cannot disturb the snapshot being served; `/api/data` fails on purpose, which is
 * what puts the app in read-only mode.
 */
export async function openApp(page: Page): Promise<void> {
	await page.route('**/api/data', (route) => route.fulfill({ status: 500, body: 'no api' }));
	await page.route('**/data.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT })
	);
	await page.goto('/');
	await page.addInitScript(() => localStorage.clear());
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator('#page')).toBeVisible();
}

/** Open a page from the docked sidebar. */
export async function showPage(page: Page, label: string): Promise<void> {
	await page
		.getByRole('navigation', { name: 'Pages' })
		.getByRole('link', { name: label, exact: true })
		.click();
	await expect(page.getByRole('heading', { level: 2, name: label })).toBeVisible();
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

/**
 * Force the content column to `px`, which is what every fold and container query reads — the same thing a
 * narrower window does, without the cost of a real viewport resize per step. Pass null to release it.
 */
export async function setContentWidth(page: Page, px: number | null): Promise<void> {
	await page.evaluate((w) => {
		const wrap = document.querySelector<HTMLElement>('.wrap')!;
		wrap.style.width = w === null ? '' : `${w}px`;
		wrap.style.maxWidth = w === null ? '' : `${w}px`;
	}, px);
	await settle(page);
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
