import { describe, expect, it } from 'vitest';
import { moneyFlow } from '$lib/data/flow';
import { makeData } from '$lib/data/__fixtures__/dashboard';

const node = (m: ReturnType<typeof moneyFlow>, id: string) => m.nodes.find((n) => n.id === id);
const linksInto = (m: ReturnType<typeof moneyFlow>, target: string) =>
	m.links.filter((l) => l.target === target);

describe('moneyFlow', () => {
	it('anchors totals to the yearly rollup and conserves gross', () => {
		const m = moneyFlow(makeData());
		// gross = 3000 + 3000, take-home = 1550 + 1550
		expect(node(m, 'Gross')!.value).toBe(6000);
		expect(node(m, 'Take-home')!.value).toBe(3100);

		// Everything leaving Gross sums back to Gross.
		const outOfGross = m.links.filter((l) => l.source === 'Gross').reduce((a, l) => a + l.value, 0);
		expect(outOfGross).toBeCloseTo(6000);
	});

	it('keeps each contribution label as its own node scaled to the authoritative total', () => {
		const m = moneyFlow(makeData());
		expect(node(m, '401k')).toBeUndefined(); // no longer collapsed into a family
		// conTotal = 1500, split HSA:150 / Roth401k:600 -> Roth401k gets 600/750 * 1500 = 1200.
		expect(node(m, 'Roth401k')!.value).toBeCloseTo(1200);
		expect(node(m, 'HSA')!.value).toBeCloseTo(300);
	});

	it('routes contributions into Savings, which reconciles to lifetime saved', () => {
		const d = makeData();
		const m = moneyFlow(d);
		const savedLifetime = d.overview.by_year.reduce((a, r) => a + r.saved, 0); // 2180 + 2254.5

		expect(node(m, 'Savings')!.value).toBeCloseTo(savedLifetime);
		// Savings is fed by both contribution families plus the take-home cash surplus.
		const sources = linksInto(m, 'Savings')
			.map((l) => l.source)
			.sort();
		expect(sources).toEqual(['HSA', 'Roth401k', 'Take-home']);
		expect(linksInto(m, 'Savings').reduce((a, l) => a + l.value, 0)).toBeCloseTo(savedLifetime);
	});

	it('falls back to a single Contributions bucket when no paycheck breakdown exists', () => {
		const d = makeData();
		// Strip the only paycheck's breakdown source but keep the yearly contribution totals.
		d.months['2025-01']!.paychecks = [];
		const m = moneyFlow(d);
		expect(node(m, 'Contributions')!.value).toBeCloseTo(1500);
		expect(node(m, 'HSA')).toBeUndefined();
	});
});
