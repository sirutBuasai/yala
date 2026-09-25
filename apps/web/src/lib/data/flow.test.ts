import { describe, expect, it } from 'vitest';
import { moneyFlow } from '$lib/data/flow';
import { makeData } from '$lib/data/__fixtures__/dashboard';
import type { Scope } from '$lib/data/scope';

const ALL: Scope = { level: 'all' };

const node = (m: ReturnType<typeof moneyFlow>, id: string) => m.nodes.find((n) => n.id === id);
const linksInto = (m: ReturnType<typeof moneyFlow>, target: string) =>
	m.links.filter((l) => l.target === target);

describe('moneyFlow', () => {
	it('anchors totals to the yearly rollup and conserves gross', () => {
		const m = moneyFlow(makeData(), ALL);
		expect(node(m, 'Gross')!.value).toBe(6000);
		expect(node(m, 'Take-home')!.value).toBe(3100);

		// Everything leaving Gross sums back to Gross.
		const outOfGross = m.links.filter((l) => l.source === 'Gross').reduce((a, l) => a + l.value, 0);
		expect(outOfGross).toBeCloseTo(6000);
	});

	it('keeps each contribution label as its own node scaled to the authoritative total', () => {
		const m = moneyFlow(makeData(), ALL);
		expect(node(m, '401k')).toBeUndefined(); // not collapsed into a family
		// Each label takes its paycheck share of the authoritative contributions total.
		expect(node(m, 'Roth401k')!.value).toBeCloseTo(1200);
		expect(node(m, 'HSA')!.value).toBeCloseTo(300);
	});

	it('routes contributions into Saved, which reconciles to lifetime saved', () => {
		const d = makeData();
		const m = moneyFlow(d, ALL);
		const savedLifetime = d.overview.by_year.reduce((a, r) => a + r.saved, 0);

		expect(node(m, 'Saved')!.value).toBeCloseTo(savedLifetime);
		// Saved is fed by every contribution label plus the take-home cash surplus.
		const sources = linksInto(m, 'Saved')
			.map((l) => l.source)
			.sort();
		expect(sources).toEqual(['HSA', 'Roth401k', 'Take-home']);
		expect(linksInto(m, 'Saved').reduce((a, l) => a + l.value, 0)).toBeCloseTo(savedLifetime);
	});

	it('falls back to a single Contributions bucket when no paycheck breakdown exists', () => {
		const d = makeData();
		// Strip the paycheck breakdown but keep the yearly contribution totals.
		d.months['2025-01']!.paychecks = [];
		const m = moneyFlow(d, ALL);
		expect(node(m, 'Contributions')!.value).toBeCloseTo(1500);
		expect(node(m, 'HSA')).toBeUndefined();
	});

	it('reads one month from its own paychecks and categories', () => {
		const m = moneyFlow(makeData(), { level: 'month', monthKey: '2025-01' });
		expect(node(m, 'Gross')!.value).toBe(3000);
		expect(node(m, 'Tax')!.value).toBeCloseTo(600);
		expect(node(m, 'Grocery')!.value).toBe(30);
		expect(node(m, 'Takeouts')!.value).toBe(15.5);
	});

	it('pays spending past take-home from savings, biggest categories from pay first', () => {
		const d = makeData();
		d.months['2025-01']!.by_category = [
			{ category: 'Grocery', amount: 1000 },
			{ category: 'Takeouts', amount: 800 }
		];
		const m = moneyFlow(d, { level: 'month', monthKey: '2025-01' });
		expect(node(m, 'From savings')!.value).toBe(250);
		expect(linksInto(m, 'Grocery')).toEqual([
			{ source: 'Take-home', target: 'Grocery', value: 1000 }
		]);
		expect(linksInto(m, 'Takeouts').map((l) => [l.source, l.value])).toEqual([
			['Take-home', 550],
			['From savings', 250]
		]);
	});

	it('draws a month with no paychecks from its spending alone', () => {
		const m = moneyFlow(makeData(), { level: 'month', monthKey: '2024-12' });
		expect(node(m, 'Gross')).toBeUndefined();
		expect(node(m, 'From savings')!.value).toBe(120);
		expect(linksInto(m, 'Grocery')).toEqual([
			{ source: 'From savings', target: 'Grocery', value: 70 }
		]);
	});
});
