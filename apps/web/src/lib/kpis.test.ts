import { describe, expect, it } from 'vitest';
import { type KpiTile, incomeKpis, monthlyKpis, overviewKpis, spendingKpis } from './kpis';
import { makeData } from './__fixtures__/dashboard';

const label = (tiles: KpiTile[], l: string) => tiles.find((t) => t.label.startsWith(l));

describe('spendingKpis', () => {
	it('summarizes a year: total spent, and per-active-month income / spending / savings', () => {
		const tiles = spendingKpis(makeData(), 2025);
		expect(label(tiles, 'Spent 2025')!.value).toBe('$46'); // rounds 45.5
		// only January is active -> avg == total
		expect(label(tiles, 'Avg income / month')!.value).toBe('$2,300');
		expect(label(tiles, 'Avg spending / month')!.value).toBe('$46'); // rounds 45.5
		expect(label(tiles, 'Avg savings / month')!.value).toBe('$2,255'); // 2300 - 45.5 -> 2254.5
		expect(label(tiles, 'Avg savings / month')!.dir).toBe('up');
	});

	it('reports zeros for a year with no data (navigated-to empty year)', () => {
		const tiles = spendingKpis(makeData(), 1999);
		expect(label(tiles, 'Spent 1999')!.value).toBe('$0');
		expect(label(tiles, 'Avg income / month')!.value).toBe('$0');
		expect(label(tiles, 'Avg spending / month')!.value).toBe('$0');
	});
});

describe('overviewKpis', () => {
	it('aggregates lifetime figures and per-year averages', () => {
		const tiles = overviewKpis(makeData());
		expect(label(tiles, 'Lifetime income')!.value).toBe('$4,600');
		expect(label(tiles, 'Lifetime spent')!.value).toBe('$166'); // 120 + 45.5
		expect(label(tiles, 'Avg income / year')!.value).toBe('$2,300'); // 4600 / 2 years
		expect(label(tiles, 'Avg spending / year')!.value).toBe('$83'); // 165.5 / 2 -> 82.75
		expect(label(tiles, 'Avg saving / year')!.value).toBe('$2,217'); // 4434.5 / 2 -> 2217.25
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

	it('reports zeros for a month with no data (navigated-to empty month)', () => {
		const tiles = monthlyKpis(makeData(), '1999-01');
		expect(label(tiles, 'Saved')!.value).toBe('$0');
		expect(label(tiles, '% used')!.value).toBe('—');
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

	it('reports zeros when the year has no income row (empty year)', () => {
		const tiles = incomeKpis(makeData(), 1999);
		expect(label(tiles, 'Gross')!.value).toBe('$0');
		expect(label(tiles, 'Net')!.value).toBe('$0');
	});
});
