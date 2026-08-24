import { describe, expect, it } from 'vitest';
import type { Scalar } from '$lib/data/primitives';
import { incomeScalars, monthlyScalars, overviewScalars, spendingScalars } from '$lib/data/scalar';
import { makeData } from '$lib/data/__fixtures__/dashboard';

const find = (tiles: Scalar[], l: string) => tiles.find((t) => t.label.startsWith(l));

describe('spendingScalars', () => {
	it('summarizes a year: total spent, and per-active-month income / spending / savings', () => {
		const tiles = spendingScalars(makeData(), 2025);
		expect(find(tiles, 'Spent 2025')!.value).toBe(45.5);
		// only January is active -> avg == total
		expect(find(tiles, 'Avg income / month')!.value).toBe(2300);
		expect(find(tiles, 'Avg spending / month')!.value).toBe(45.5);
		expect(find(tiles, 'Avg savings / month')!.value).toBe(2254.5);
		expect(find(tiles, 'Avg savings / month')!.dir).toBe('up');
		expect(find(tiles, 'Spent 2025')!.unit).toEqual({ kind: 'money', currency: 'USD' });
	});

	it('reports zeros for a year with no data (navigated-to empty year)', () => {
		const tiles = spendingScalars(makeData(), 1999);
		expect(find(tiles, 'Spent 1999')!.value).toBe(0);
		expect(find(tiles, 'Avg income / month')!.value).toBe(0);
		expect(find(tiles, 'Avg spending / month')!.value).toBe(0);
	});
});

describe('overviewScalars', () => {
	it('aggregates lifetime figures and per-year averages', () => {
		const tiles = overviewScalars(makeData());
		expect(find(tiles, 'Lifetime income')!.value).toBe(4600);
		expect(find(tiles, 'Lifetime spent')!.value).toBe(165.5); // 120 + 45.5
		expect(find(tiles, 'Avg income / year')!.value).toBe(2300); // 4600 / 2
		expect(find(tiles, 'Avg spending / year')!.value).toBe(82.75); // 165.5 / 2
		expect(find(tiles, 'Avg saving / year')!.value).toBe(2217.25); // 4434.5 / 2
	});

	it('marks negative lifetime savings as down', () => {
		const d = makeData();
		d.overview.by_year = [{ year: 2024, spent: 500, income: 100, saved: -400 }];
		expect(find(overviewScalars(d), 'Lifetime saved')!.dir).toBe('down');
	});

	it('returns [] with no years', () => {
		const d = makeData();
		d.overview.by_year = [];
		expect(overviewScalars(d)).toEqual([]);
	});
});

describe('monthlyScalars', () => {
	it('computes saved = income - spent for a month', () => {
		const tiles = monthlyScalars(makeData(), '2025-01');
		expect(find(tiles, 'Saved')!.value).toBe(2254.5); // 2300 - 45.5
		expect(find(tiles, 'Saved')!.dir).toBe('up');
	});

	it('reports % used as a percent, and null (→ em dash) when there is no income', () => {
		const used = find(monthlyScalars(makeData(), '2025-01'), '% used')!;
		expect(used.unit).toEqual({ kind: 'percent' });
		expect(used.value).toBeCloseTo((45.5 / 2300) * 100);

		const d = makeData();
		d.months['2025-01'].total_income = 0;
		expect(find(monthlyScalars(d, '2025-01'), '% used')!.value).toBeNull();
	});

	it('reports zeros for a month with no data (navigated-to empty month)', () => {
		const tiles = monthlyScalars(makeData(), '1999-01');
		expect(find(tiles, 'Saved')!.value).toBe(0);
		expect(find(tiles, '% used')!.value).toBeNull();
	});
});

describe('incomeScalars', () => {
	it('surfaces gross, deductions, contributions, and net with a savings-rate delta', () => {
		const tiles = incomeScalars(makeData(), 2025);
		expect(find(tiles, 'Gross')!.value).toBe(3000);
		expect(find(tiles, 'Deductions')!.value).toBe(700);
		expect(find(tiles, 'Contributions')!.value).toBe(750);
		const net = find(tiles, 'Net')!;
		expect(net.value).toBe(2300);
		expect(net.delta?.unit).toEqual({ kind: 'percent' });
		expect(net.delta?.value).toBeCloseTo((2254.5 / 2300) * 100);
	});

	it('reports zeros when the year has no income row (empty year)', () => {
		const tiles = incomeScalars(makeData(), 1999);
		expect(find(tiles, 'Gross')!.value).toBe(0);
		expect(find(tiles, 'Net')!.value).toBe(0);
	});
});
