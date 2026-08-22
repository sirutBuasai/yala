import { describe, expect, it } from 'vitest';
import { type KpiTile, incomeKpis, monthlyKpis, overviewKpis, spendingKpis } from './kpis';
import { makeData } from './__fixtures__/dashboard';

const label = (tiles: KpiTile[], l: string) => tiles.find((t) => t.label.startsWith(l));

describe('spendingKpis', () => {
	it('summarizes a year: total, avg/active-month, biggest month, top category', () => {
		const tiles = spendingKpis(makeData(), 2025);
		expect(label(tiles, 'Spent 2025')!.value).toBe('$46'); // rounds 45.5
		// only January is active -> avg == total
		expect(label(tiles, 'Avg / month')!.value).toBe('$46');
		expect(label(tiles, 'Avg / month')!.foot).toBe('1 active months');
		expect(label(tiles, 'Biggest month')!.value).toBe('Jan');
		expect(label(tiles, 'Top category')!.value).toBe('Grocery'); // 30 > 15.5
	});

	it('returns [] for an unknown year', () => {
		expect(spendingKpis(makeData(), 1999)).toEqual([]);
	});
});

describe('overviewKpis', () => {
	it('aggregates lifetime figures and year span', () => {
		const tiles = overviewKpis(makeData());
		expect(label(tiles, 'Lifetime income')!.value).toBe('$4,600');
		expect(label(tiles, 'Lifetime spent')!.value).toBe('$166'); // 120 + 45.5
		expect(label(tiles, 'Years tracked')!.value).toBe('2024–2025');
	});

	it('marks negative lifetime savings as down', () => {
		const d = makeData();
		d.overview.by_year = [{ year: 2024, spent: 500, income: 100, saved: -400 }];
		const saved = overviewKpis(d).find((t) => t.label === 'Lifetime saved')!;
		expect(saved.dir).toBe('down');
	});

	it('returns [] with no years', () => {
		const d = makeData();
		d.overview.by_year = [];
		expect(overviewKpis(d)).toEqual([]);
	});
});

describe('monthlyKpis', () => {
	it('computes saved = income - spent for a month', () => {
		const tiles = monthlyKpis(makeData(), '2025-01');
		expect(label(tiles, 'Saved')!.value).toBe('$2,255'); // 2300 - 45.5 -> 2254.5 -> 2255
		expect(label(tiles, 'Saved')!.dir).toBe('up');
	});

	it('shows an em dash for % used when there is no income', () => {
		const d = makeData();
		d.months['2025-01'].total_income = 0;
		const used = monthlyKpis(d, '2025-01').find((t) => t.label === '% used')!;
		expect(used.value).toBe('—');
	});

	it('returns [] for an unknown month', () => {
		expect(monthlyKpis(makeData(), '1999-01')).toEqual([]);
	});
});

describe('incomeKpis', () => {
	it('surfaces gross, deductions, contributions, and net', () => {
		const tiles = incomeKpis(makeData(), 2025);
		expect(label(tiles, 'Gross')!.value).toBe('$3,000');
		expect(label(tiles, 'Deductions')!.value).toBe('$700');
		expect(label(tiles, 'Contributions')!.value).toBe('$750');
		expect(label(tiles, 'Net')!.value).toBe('$2,300');
	});

	it('returns [] when the year has no income row', () => {
		expect(incomeKpis(makeData(), 1999)).toEqual([]);
	});
});
