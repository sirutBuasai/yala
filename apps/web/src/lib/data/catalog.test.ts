import { describe, expect, it } from 'vitest';
import { build, CATALOG_BY_ID, dataOfKind } from '$lib/data/catalog';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('dataOfKind', () => {
	it('groups catalog entries by the primitive kind they produce', () => {
		expect(dataOfKind('categorical').every((d) => d.kind === 'categorical')).toBe(true);
		expect(dataOfKind('flow').map((d) => d.id)).toContain('money.flow');
		expect(dataOfKind('multiseries').map((d) => d.id)).toContain('overview.income_spent_saved');
	});
});

describe('spending.by_category', () => {
	it('all-time uses overview.all_time_by_category (largest first)', () => {
		const p = build(makeData(), 'spending.by_category', { level: 'all' });
		expect(p.kind).toBe('categorical');
		if (p.kind !== 'categorical') return;
		expect(p.points).toEqual([
			{ key: 'Grocery', value: 100 },
			{ key: 'Takeouts', value: 65.5 }
		]);
	});

	it('year sums each month row per category', () => {
		const p = build(makeData(), 'spending.by_category', { level: 'year', year: 2025 });
		if (p.kind !== 'categorical') throw new Error('expected categorical');
		expect(p.points).toEqual([
			{ key: 'Grocery', value: 30 },
			{ key: 'Takeouts', value: 15.5 }
		]);
	});

	it('month reads that month page by_category', () => {
		const p = build(makeData(), 'spending.by_category', { level: 'month', monthKey: '2024-12' });
		if (p.kind !== 'categorical') throw new Error('expected categorical');
		expect(p.points).toEqual([
			{ key: 'Grocery', value: 70 },
			{ key: 'Takeouts', value: 50 }
		]);
	});
});

describe('scope year fallback', () => {
	it('year scope without an explicit year uses the latest year', () => {
		const p = build(makeData(), 'spending.by_month', { level: 'year' });
		if (p.kind !== 'series') throw new Error('expected series');
		// latest year is 2025, whose only spend is in January (30 + 15.5)
		expect(p.points[0]).toEqual({ label: 'Jan', value: 45.5 });
	});

	it('falls back to the current calendar year when meta.years is empty', () => {
		const d = makeData();
		d.meta.years = [];
		d.years = {};
		const p = build(d, 'spending.by_month', { level: 'year' });
		if (p.kind !== 'series') throw new Error('expected series');
		expect(p.points).toHaveLength(12);
		expect(p.points.every((pt) => pt.value === 0)).toBe(true);
	});
});

describe('income.paychecks table', () => {
	it('sums deduction/contribution maps into single columns', () => {
		const p = build(makeData(), 'income.paychecks', { level: 'month', monthKey: '2025-01' });
		if (p.kind !== 'table') throw new Error('expected table');
		expect(p.columns.map((c) => c.label)).toEqual([
			'Date',
			'Gross',
			'Deductions',
			'Contributions',
			'Net',
			'Take-home'
		]);
		// Deductions 600+100=700, Contributions 150+600=750
		expect(p.rows[0]).toEqual(['2025-01-15', 3000, 700, 750, 2300, 1550]);
	});

	it('year scope filters recent_paychecks by date prefix', () => {
		const p = build(makeData(), 'income.paychecks', { level: 'year', year: 2024 });
		if (p.kind !== 'table') throw new Error('expected table');
		expect(p.rows).toEqual([]); // the only paycheck is 2025
	});
});

describe('spending.category_by_month matrix', () => {
	it('produces a 12-month × categories value grid', () => {
		const p = build(makeData(), 'spending.category_by_month', { level: 'year', year: 2025 });
		if (p.kind !== 'matrix') throw new Error('expected matrix');
		expect(p.rows).toHaveLength(12); // months
		expect(p.cols).toEqual(['Grocery', 'Takeouts']);
		expect(p.values[0]).toEqual([30, 15.5]); // January: Grocery, Takeouts
	});
});

describe('overview.income_spent_saved', () => {
	it('bundles three compatible series over the same labels', () => {
		const p = build(makeData(), 'overview.income_spent_saved', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');
		expect(p.series.map((s) => s.name)).toEqual(['Income', 'Spent', 'Saved']);
		expect(p.labels).toEqual(['2024', '2025']);
	});
});

describe('catalog integrity', () => {
	it('every entry builds without throwing at its declared scopes', () => {
		const d = makeData();
		for (const def of Object.values(CATALOG_BY_ID)) {
			for (const level of def.scopes) {
				const scope = level === 'month' ? { level, monthKey: '2025-01' } : { level, year: 2025 };
				expect(() => def.build(d, scope)).not.toThrow();
			}
		}
	});
});
