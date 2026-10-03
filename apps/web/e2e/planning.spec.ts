// The Planning page: the assumption panes move a draft that every other pane draws, and nothing reaches
// the ledger until Save. The board itself is covered by the board suites (charts, steady, arrange).

import { expect, type Page } from '@playwright/test';
import { dragBy, openApp, settle, showPage, startArranging, test, violations } from './app';

const projection = (page: Page) => page.locator('[data-pane="projection"]');
const milestones = (page: Page) => page.locator('[data-pane="milestones"]');
const rate = (page: Page) => page.getByRole('spinbutton', { name: 'Withdrawal rate' });

/** The projection needs a birth year to place a retirement year against; the fixture sets none, which
    is the state a ledger that never set one opens in. */
async function setBirthYear(page: Page): Promise<void> {
	const born = page.getByRole('spinbutton', { name: 'Birth year' });
	await born.fill('1990');
	await born.press('Enter');
	await settle(page);
}

/** Step a figure up by its arrow key, as its spinbutton role promises. */
async function stepUp(page: Page, label: string, times = 1): Promise<void> {
	await page.getByRole('spinbutton', { name: label }).focus();
	for (let i = 0; i < times; i++) await page.keyboard.press('ArrowUp');
	await page.getByRole('spinbutton', { name: label }).blur();
	await settle(page);
}

test.beforeEach(async ({ page }) => {
	await openApp(page);
	await showPage(page, 'Planning');
});

test('the page has no accessibility violations', async ({ page }) => {
	const found = await violations(page);
	expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('a figure redraws the panes beside it rather than leaving them stale', async ({ page }) => {
	await setBirthYear(page);

	// Every path together, not one of them: the chart draws the projection alongside the levels it is judged
	// against, and which of those an assumption moves is the projection's business, not this test's.
	const drawn = () =>
		projection(page)
			.locator('svg.chart path')
			.evaluateAll((els) => els.map((e) => e.getAttribute('d')).join('|'));
	// Read off the announced figure, not the arc: a reading already past its target pegs the ring full.
	const rings = () =>
		page
			.locator('[data-pane="progress"] [role=meter]')
			.evaluateAll((els) => els.map((el) => el.getAttribute('aria-valuetext')));
	const before = await drawn();
	const ringsBefore = await rings();

	// The return compounds the balance, so it moves the projected path; the withdrawal rate sets the TARGET
	// the rings are read against instead.
	await stepUp(page, 'Expected nominal return', 12);
	expect(await drawn()).not.toBe(before);

	await stepUp(page, 'Withdrawal rate', 12);
	expect(await rings()).not.toEqual(ringsBefore);
});

test('a slider moves its figure and the projection as it is dragged', async ({ page }) => {
	await setBirthYear(page);
	const drawn = () =>
		projection(page)
			.locator('svg.chart path')
			.evaluateAll((els) => els.map((e) => e.getAttribute('d')).join('|'));
	const reading = page.getByRole('spinbutton', { name: 'Expected nominal return' });
	const before = await drawn();
	const stated = await reading.getAttribute('aria-valuenow');

	// Off the icon rail the page was opened from, which otherwise stays expanded over the left panes.
	await projection(page).hover();
	const track = page.getByRole('slider', { name: 'Expected nominal return' });
	await track.scrollIntoViewIfNeeded();
	const box = (await track.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
	await settle(page);

	expect(await reading.getAttribute('aria-valuenow')).not.toBe(stated);
	expect(await drawn()).not.toBe(before);
});

test('Save reads Saved until a change, and Discard returns the ledger values', async ({ page }) => {
	const save = page.locator('[data-pane="changes"] .btn-primary');
	const discard = page.getByRole('button', { name: 'Discard' });
	await expect(save).toHaveText('Saved');
	await expect(save).toBeDisabled();
	await expect(discard).toBeDisabled();

	const stated = await rate(page).getAttribute('aria-valuenow');
	await stepUp(page, 'Withdrawal rate');
	await expect(save).toHaveText('Save changes');
	await expect(save).toBeEnabled();
	await expect(discard).toBeEnabled();

	await discard.click();
	await settle(page);
	expect(await rate(page).getAttribute('aria-valuenow')).toBe(stated);
	await expect(save).toHaveText('Saved');
	await expect(save).toBeDisabled();
});

test('a figure resets from the Default beside its hint', async ({ page }) => {
	const stated = await rate(page).getAttribute('aria-valuenow');
	await stepUp(page, 'Withdrawal rate');
	expect(await rate(page).getAttribute('aria-valuenow')).not.toBe(stated);

	// Off the icon rail the page was opened from, which otherwise stays expanded over the left panes.
	await projection(page).hover();
	await page
		.locator('.numfield', { hasText: 'Withdrawal rate' })
		.getByRole('button', { name: 'Default' })
		.click();
	await settle(page);
	expect(await rate(page).getAttribute('aria-valuenow')).toBe(stated);
});

test('the summary keeps to one line, scaling rather than wrapping, until a phone', async ({
	page
}) => {
	await setBirthYear(page);
	const line = milestones(page).locator('.headline');
	for (const width of [1400, 1100, 700, 420]) {
		const phone = width < 480;
		await page.setViewportSize({ width, height: 900 });
		await settle(page);
		const { lines, over } = await line.evaluate((el) => ({
			lines: Math.round(
				el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)
			),
			over: el.scrollWidth - el.clientWidth
		}));
		// On a phone even the smallest readable size is too wide, so it wraps there instead.
		if (!phone) expect(lines, `${width}px`).toBe(1);
		expect(over, `${width}px`).toBeLessThanOrEqual(2);
	}
});

test('the draft outlives a page switch but not a reload', async ({ page }) => {
	const stated = await rate(page).getAttribute('aria-valuenow');
	await stepUp(page, 'Withdrawal rate');
	const moved = await rate(page).getAttribute('aria-valuenow');
	expect(moved).not.toBe(stated);

	await showPage(page, 'Dashboard');
	await showPage(page, 'Planning');
	expect(await rate(page).getAttribute('aria-valuenow')).toBe(moved);

	await page.reload();
	await expect(rate(page)).toHaveAttribute('aria-valuenow', stated!);
});

test("the projection's hover reads every line and the age at that year", async ({ page }) => {
	await setBirthYear(page);
	const chart = projection(page).locator('svg.chart');
	const box = (await chart.boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
	await settle(page);

	const tip = page.locator('.tooltip');
	await expect(tip).toContainText(/\d{4} · age \d+/);
	for (const line of ['Investing', 'Coasting', 'FI number']) await expect(tip).toContainText(line);
});

test('the projection reads its market risk', async ({ page }) => {
	await setBirthYear(page);
	await expect(projection(page)).toContainText(/\d+% of 1,000 simulated markets last to \d+\./);
	await expect(projection(page).locator('.legend')).toContainText('Middle 80% of markets');
});

test('the summary names when FI comes and how often the plan lasts, over its milestones', async ({
	page
}) => {
	await expect(milestones(page)).toContainText('Set your birth year in Timeline');
	await setBirthYear(page);
	await expect(milestones(page)).toContainText(/success rate of \d+%|don't reach FI/);
	for (const name of ['Today', 'Retire']) await expect(milestones(page)).toContainText(name);
	await expect(page.getByRole('button', { name: 'How success rate is calculated' })).toBeVisible();
});

/** Every milestone's year shows in a label, no two labels overlap, and each stays inside the timeline. */
async function expectLabelled(page: Page, where: string) {
	const found = await milestones(page).evaluate((pane) => {
		const labelsRow = pane.querySelector('.labels');
		if (!labelsRow) return { missing: pane.querySelector('.headline')?.textContent?.trim() };
		const row = labelsRow.getBoundingClientRect();
		const labels = [...pane.querySelectorAll<HTMLElement>('.label:not(.sizer)')];
		const boxes = labels.map((l) => l.getBoundingClientRect());
		const overlaps = boxes.filter((a, i) =>
			boxes.slice(i + 1).some((c) => a.left < c.right - 0.5 && c.left < a.right - 0.5)
		).length;
		return {
			dots: pane.querySelectorAll('.bar .dot').length,
			years: labels.flatMap((l) => l.querySelector('.year')!.textContent!.split(' · ')).length,
			overlaps,
			outside: boxes.filter((b) => b.left < row.left - 1 || b.right > row.right + 1).length
		};
	});
	expect(found.missing, where).toBeUndefined();
	expect(found.years, where).toBe(found.dots);
	expect(found.overlaps, where).toBe(0);
	expect(found.outside, where).toBe(0);
}

test('the timeline labels every milestone, whatever the plan, and never overlaps them', async ({
	page
}) => {
	const set = async (label: string, value: number) => {
		const field = page.getByRole('spinbutton', { name: label });
		await field.fill(String(value));
		await field.press('Enter');
	};
	await setBirthYear(page);
	const plans: [string, [string, number][]][] = [
		// Bug: every label vanished once two milestones merged into one year.
		[
			'spend 108k, retire 57',
			[
				['Planned spending', 108000],
				['Out-of-pocket investments', 0],
				['Target retirement age', 57],
				['Plan horizon age', 80]
			]
		],
		['retire at FI', [['Target retirement age', 35]]],
		[
			'crowded',
			[
				['Target retirement age', 36],
				['Plan horizon age', 60]
			]
		],
		['FI never', [['Planned spending', 400000]]],
		[
			'already retired',
			[
				['Birth year', 1950],
				['Plan horizon age', 80]
			]
		]
	];
	for (const [where, settings] of plans) {
		for (const [label, value] of settings) await set(label, value);
		await settle(page);
		await expectLabelled(page, where);
	}

	// A horizon already behind leaves nothing to draw, and says so rather than asking for a birth year.
	await set('Plan horizon age', 60);
	await settle(page);
	await expect(milestones(page).locator('.headline')).toHaveText(
		'Your plan runs to 60, which has passed.'
	);
});

test('the timeline narrows to its floor in one drag, and to the same floor every time', async ({
	page
}) => {
	await page.setViewportSize({ width: 1600, height: 1100 });
	await setBirthYear(page);
	await startArranging(page);
	const pane = page.locator('.cell[data-pane="milestones"]');
	const east = pane.locator(':scope > .handle.e');
	const columns = () => pane.evaluate((el) => (el as HTMLElement).style.gridColumn);

	// Bug: a resize stopped a grid step narrower each time, because the labels, still where the last
	// width put them, read as a spill.
	await dragBy(east, -1400, 0, 20);
	const floor = await columns();
	await dragBy(east, -1400, 0, 20);
	expect(await columns()).toBe(floor);
	await dragBy(east, 8 * 28, 0, 8);
	await dragBy(east, -1400, 0, 20);
	expect(await columns()).toBe(floor);
	await expectLabelled(page, `at its floor, ${floor}`);
});
