// Nothing a card holds may paint outside it, and no label may be cut off, at any width the app folds to.

import { expect } from '@playwright/test';
import {
	audit,
	expectClean,
	openApp,
	PAGE_LABELS,
	setContentWidth,
	showPage,
	test,
	WIDTHS
} from './app';

test.beforeEach(async ({ page }) => openApp(page));

for (const label of PAGE_LABELS) {
	test(`${label} contains its content at every width`, async ({ page }) => {
		await showPage(page, label);
		for (const width of WIDTHS) {
			await setContentWidth(page, width);
			expectClean(`${label} at ${width}px`, await audit(page));
		}
		await setContentWidth(page, null);
	});
}

test('a board with less than full room keeps its arrangement, drawn smaller and not editable', async ({
	page
}) => {
	await showPage(page, 'Dashboard');
	const rects = () =>
		page.locator('[data-pane]').evaluateAll((cells) => {
			const board = cells[0]!.closest('.board')!.getBoundingClientRect();
			return cells.map((c) => {
				const r = c.getBoundingClientRect();
				return [(r.left - board.left) / board.width, (r.top - board.top) / board.width];
			});
		});
	const full = await rects();

	await setContentWidth(page, 1200);
	await expect(page.locator('.board.scaled')).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
	const scaled = await rects();
	scaled.forEach(([x, y], i) => {
		expect(x).toBeCloseTo(full[i]![0]!, 2);
		expect(y).toBeCloseTo(full[i]![1]!, 2);
	});
	await setContentWidth(page, null);
});

test('a board folded into two columns leaves no gap between panes, and its columns end level', async ({
	page
}) => {
	for (const label of PAGE_LABELS) {
		await showPage(page, label);
		if (!(await page.locator('.board').count())) continue;
		await setContentWidth(page, 1100);
		const cells = await page
			.locator('.board.stacked > .cell')
			.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
		expect(cells.length, label).toBeGreaterThan(0);
		const foot = Math.max(...cells.map((c) => c.bottom));
		for (const a of cells) {
			const below = cells.filter(
				(b) => b.top >= a.bottom - 1 && b.left < a.right - 1 && a.left < b.right - 1
			);
			const next = below.length ? Math.min(...below.map((b) => b.top)) : foot;
			expect(next - a.bottom, `${label}: gap below a pane`).toBeLessThanOrEqual(1);
		}
		await setContentWidth(page, null);
	}
});
