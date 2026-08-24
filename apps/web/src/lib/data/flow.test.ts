import { describe, expect, it } from 'vitest';
import { contributionFamily, moneyFlow } from '$lib/data/flow';
import { makeData } from '$lib/data/__fixtures__/dashboard';

const node = (m: ReturnType<typeof moneyFlow>, id: string) => m.nodes.find((n) => n.id === id);
const linksInto = (m: ReturnType<typeof moneyFlow>, target: string) =>
	m.links.filter((l) => l.target === target);

describe('contributionFamily', () => {
	it('rolls every 401k variant into a single family', () => {
		for (const k of ['401k', '401K', 'Roth401k', 'Trad401k', 'AfterTax401k', '401(k)']) {
			expect(contributionFamily(k)).toBe('401k');
		}
	});

	it('leaves other contribution keys untouched', () => {
		expect(contributionFamily('HSA')).toBe('HSA');
		expect(contributionFamily('ESPP')).toBe('ESPP');
	});
});

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

	it('collapses the Roth401k paycheck key into a 401k node scaled to the authoritative total', () => {
		const m = moneyFlow(makeData());
		expect(node(m, 'Roth401k')).toBeUndefined();
		// conTotal = 1500, split HSA:150 / Roth401k:600 -> 401k gets 600/750 * 1500 = 1200.
		expect(node(m, '401k')!.value).toBeCloseTo(1200);
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
		expect(sources).toEqual(['401k', 'HSA', 'Take-home']);
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
