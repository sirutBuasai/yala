import { describe, expect, it } from 'vitest';
import { SERIES_BY_ID, seriesForPage } from './series';
import { makeData } from './__fixtures__/dashboard';

describe('seriesForPage', () => {
	it('filters the catalog by page prefix', () => {
		expect(seriesForPage('spending').every((s) => s.id.startsWith('spending.'))).toBe(true);
		expect(seriesForPage('income').every((s) => s.id.startsWith('income.'))).toBe(true);
	});
});

describe('spending.by_category', () => {
	const def = SERIES_BY_ID['spending.by_category'];

	it('all-time uses overview.all_time_by_category', () => {
		const s = def.extract(makeData(), { level: 'all' });
		expect(s).toEqual({
			shape: 'categorical',
			data: [
				{ key: 'Grocery', value: 100 },
				{ key: 'Takeouts', value: 65.5 }
			]
		});
	});

	it('year sums each month row per category', () => {
		const s = def.extract(makeData(), { level: 'year', year: 2025 });
		expect(s).toEqual({
			shape: 'categorical',
			data: [
				{ key: 'Grocery', value: 30 },
				{ key: 'Takeouts', value: 15.5 }
			]
		});
	});

	it('month reads that month page by_category', () => {
		const s = def.extract(makeData(), { level: 'month', monthKey: '2024-12' });
		expect(s).toEqual({
			shape: 'categorical',
			data: [
				{ key: 'Grocery', value: 70 },
				{ key: 'Takeouts', value: 50 }
			]
		});
	});
});

describe('scope year fallback', () => {
	it('year scope without an explicit year uses the latest year', () => {
		const s = SERIES_BY_ID['spending.by_month'].extract(makeData(), { level: 'year' });
		// latest year is 2025, whose only spend is in January (30 + 15.5)
		if (s.shape !== 'time') throw new Error('expected time shape');
		expect(s.data[0]).toEqual({ label: 'Jan', value: 45.5 });
	});

	it('falls back to the current calendar year when meta.years is empty', () => {
		const d = makeData();
		d.meta.years = [];
		d.years = {};
		const s = SERIES_BY_ID['spending.by_month'].extract(d, { level: 'year' });
		if (s.shape !== 'time') throw new Error('expected time shape');
		expect(s.data).toHaveLength(12);
		expect(s.data.every((p) => p.value === 0)).toBe(true);
	});
});

describe('income.paychecks table', () => {
	const def = SERIES_BY_ID['income.paychecks'];

	it('sums deduction/contribution maps into single columns', () => {
		const s = def.extract(makeData(), { level: 'month', monthKey: '2025-01' });
		if (s.shape !== 'table') throw new Error('expected table shape');
		expect(s.columns).toEqual(['Date', 'Gross', 'Deductions', 'Contributions', 'Net', 'Take-home']);
		// Deductions 600+100=700, Contributions 150+600=750
		expect(s.rows[0]).toEqual(['2025-01-15', 3000, 700, 750, 2300, 1550]);
	});

	it('year scope filters recent_paychecks by date prefix', () => {
		const s = def.extract(makeData(), { level: 'year', year: 2024 });
		if (s.shape !== 'table') throw new Error('expected table shape');
		expect(s.rows).toEqual([]); // the only paycheck is 2025
	});
});

describe('spending.category_by_month matrix', () => {
	it('produces a categories x 12-month value grid', () => {
		const s = SERIES_BY_ID['spending.category_by_month'].extract(makeData(), {
			level: 'year',
			year: 2025
		});
		if (s.shape !== 'matrix') throw new Error('expected matrix shape');
		expect(s.rows).toEqual(['Grocery', 'Takeouts']);
		expect(s.cols).toHaveLength(12);
		expect(s.values[0][0]).toBe(30); // Grocery, January
		expect(s.values[1][0]).toBe(15.5); // Takeouts, January
	});
});
