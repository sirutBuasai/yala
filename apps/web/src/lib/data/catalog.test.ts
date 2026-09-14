import { describe, expect, it } from 'vitest';
import {
	build,
	categoryMetricDefs,
	componentMetricDefs,
	CATALOG,
	CATALOG_BY_ID,
	dataOfKind
} from '$lib/data/catalog';
import { seriesColor } from '$lib/charts/registry';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('dataOfKind', () => {
	it('groups catalog entries by the primitive kind they produce', () => {
		expect(dataOfKind('categorical').every((d) => d.kind === 'categorical')).toBe(true);
		expect(dataOfKind('flow').map((d) => d.id)).toContain('money.flow');
		expect(dataOfKind('multiseries').map((d) => d.id)).toContain('overview.cash_flow_bars');
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
		const p = build(makeData(), 'trend.spending', { level: 'year' });
		if (p.kind !== 'series') throw new Error('expected series');
		expect(p.points[0]).toEqual({ label: 'Jan', value: 45.5 });
	});

	it('falls back to the current calendar year when meta.years is empty', () => {
		const d = makeData();
		d.meta.years = [];
		d.years = {};
		const p = build(d, 'trend.spending', { level: 'year' });
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
		// The deduction and contribution maps collapse to one column each.
		expect(p.rows[0]).toEqual(['2025-01-15', 3000, 700, 750, 2300, 1550]);
	});

	it('year scope filters recent_paychecks by date prefix', () => {
		const p = build(makeData(), 'income.paychecks', { level: 'year', year: 2024 });
		if (p.kind !== 'table') throw new Error('expected table');
		expect(p.rows).toEqual([]);
	});
});

describe('spending.category_by_month matrix', () => {
	it('produces a months × categories value grid, months down', () => {
		const p = build(makeData(), 'spending.category_by_month', { level: 'year', year: 2025 });
		if (p.kind !== 'matrix') throw new Error('expected matrix');
		expect(p.rows).toEqual(['Jan']); // the fixture logs one month
		expect(p.cols).toEqual(['Grocery', 'Takeouts']); // biggest first
		// values[monthIndex][categoryIndex]
		expect(p.values[0]).toEqual([30, 15.5]);
	});
});

describe('overview.cash_flow_bars', () => {
	it('bundles four compatible series over the same labels', () => {
		const p = build(makeData(), 'overview.cash_flow_bars', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');
		expect(p.series.map((s) => s.name)).toEqual(['Net income', 'Take-home', 'Spent', 'Saved']);
		expect(p.labels).toEqual(['2024', '2025']);
	});

	// The bars sit side by side, so two sharing a role token would read as one measure. Whether two
	// DIFFERENT tokens resolve to distinguishable hues is app.css's to keep.
	it('gives every bar its own role token', () => {
		const p = build(makeData(), 'overview.cash_flow_bars', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');
		const roles = p.series.map((s) => seriesColor(s.name));
		expect(new Set(roles).size).toBe(roles.length);
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

	it('tones the Saved figure by its sign', () => {
		const p = build(makeData(), 'saved.total', { level: 'all' });
		if (p.kind !== 'scalar') throw new Error('expected scalar');
		expect(p.value).toBe(4434.5);
		expect(p.tone).toBe('good');
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
	// Ids are GENERATED from small tables, so one repeated row would shadow a def in `CATALOG_BY_ID`
	// and make a figure vanish with nothing to say it went.
	it('has no duplicate ids', () => {
		const ids = CATALOG.map((d) => d.id);
		expect([...new Set(ids)]).toHaveLength(ids.length);
	});

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
