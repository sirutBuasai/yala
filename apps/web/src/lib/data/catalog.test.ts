import { describe, expect, it } from 'vitest';
import {
	build,
	categoryMetricDefs,
	componentMetricDefs,
	CATALOG_BY_ID,
	dataOfKind
} from '$lib/data/catalog';
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
	it('produces a categories × 12-month value grid', () => {
		const p = build(makeData(), 'spending.category_by_month', { level: 'year', year: 2025 });
		if (p.kind !== 'matrix') throw new Error('expected matrix');
		expect(p.cols).toHaveLength(12); // months across
		expect(p.rows).toEqual(['Grocery', 'Takeouts']); // biggest first
		// values[categoryIndex][monthIndex] — January holds the fixture's only spend.
		expect(p.values[0]![0]).toBe(30); // Grocery, January
		expect(p.values[1]![0]).toBe(15.5); // Takeouts, January
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

describe('scalar metrics', () => {
	it('registers scalar metric entries alongside chart primitives', () => {
		const ids = dataOfKind('scalar').map((d) => d.id);
		expect(ids).toContain('income.total');
		expect(ids).toContain('ratio.savings_rate');
		expect(dataOfKind('scalar').every((d) => d.kind === 'scalar')).toBe(true);
	});

	it('builds a savings-rate percent scalar', () => {
		const p = build(makeData(), 'ratio.savings_rate', { level: 'all' });
		if (p.kind !== 'scalar') throw new Error('expected scalar');
		expect(p.unit).toEqual({ kind: 'percent' });
		expect(p.value).toBeCloseTo((4434.5 / 4600) * 100, 6);
	});

	it('signs the Saved tile by value', () => {
		const p = build(makeData(), 'saved.total', { level: 'all' });
		if (p.kind !== 'scalar') throw new Error('expected scalar');
		expect(p.value).toBe(4434.5);
		expect(p.dir).toBe('up');
	});
});

describe('data-dependent metric defs', () => {
	it('generates per-category amount + share defs', () => {
		const d = makeData();
		const defs = categoryMetricDefs(d);
		const grocery = defs.find((x) => x.id === 'category.Grocery.amount');
		if (!grocery) throw new Error('expected a Grocery amount def');
		const p = grocery.build(d, { level: 'all' });
		if (p.kind !== 'scalar') throw new Error('expected scalar');
		expect(p.value).toBe(100);
	});

	it('enumerates paycheck line-items present in a scope', () => {
		const d = makeData();
		const defs = componentMetricDefs(d, { level: 'month', monthKey: '2025-01' });
		const tax = defs.find((x) => x.id === 'paycheck.deductions.Tax');
		if (!tax) throw new Error('expected a Tax def');
		const p = tax.build(d, { level: 'month', monthKey: '2025-01' });
		if (p.kind !== 'scalar') throw new Error('expected scalar');
		expect(p.value).toBe(600);
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
