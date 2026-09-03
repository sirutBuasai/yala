import { describe, expect, it } from 'vitest';
import { build, CATALOG_BY_ID, dataOfKind } from '$lib/data/catalog';
import type { Scalar } from '$lib/data/primitives';
import { formatUnit, MONTHS, PERCENT, YEARS } from '$lib/data/primitives';
import { makeData, makeNetWorthData } from '$lib/data/__fixtures__/dashboard';
import type { Scope, ScopeLevel } from '$lib/data/scope';

const scopeFor = (level: ScopeLevel): Scope =>
	level === 'year'
		? { level, year: 2025 }
		: level === 'month'
			? { level, monthKey: '2025-01' }
			: { level };

const scalar = (id: string, scope: Scope = { level: 'all' }) =>
	build(makeNetWorthData(), id, scope) as Scalar;

// --- the registry itself ---

describe('catalog integrity', () => {
	it('every entry builds at every scope it declares, with and without net-worth data', () => {
		for (const data of [makeData(), makeNetWorthData()]) {
			for (const def of Object.values(CATALOG_BY_ID)) {
				for (const level of def.scopes) {
					expect(() => build(data, def.id, scopeFor(level)), `${def.id} @ ${level}`).not.toThrow();
				}
			}
		}
	});

	it('every entry produces the primitive kind it advertises', () => {
		const data = makeNetWorthData();
		for (const def of Object.values(CATALOG_BY_ID)) {
			const level = def.scopes[0]!;
			expect(build(data, def.id, scopeFor(level)).kind, def.id).toBe(def.kind);
		}
	});

	it('drops no net-worth id the Net Worth page renders', () => {
		const ids = Object.keys(CATALOG_BY_ID);
		for (const id of [
			'networth.change',
			'networth.saved',
			'networth.other',
			'networth.liabilities_trend',
			'networth.allocation_share',
			'networth.accounts',
			'networth.saved_vs_other',
			'networth.year_table',
			'networth.fi_number',
			'networth.fi_progress',
			'networth.coast_fi',
			'networth.years_of_freedom',
			'networth.runway',
			'networth.balance_growth',
			'networth.top_account'
		]) {
			expect(ids, id).toContain(id);
		}
	});
});

// --- growth decomposition ---

describe('growth decomposition', () => {
	it('splits a year’s change into what was saved and what was not', () => {
		// 2025 opens at the 2024-12 snapshot (3000) and closes at 6000 → a change of 3000.
		const saved = scalar('networth.saved', { level: 'year', year: 2025 });
		const other = scalar('networth.other', { level: 'year', year: 2025 });

		expect(saved.value).toBe(2254.5); // the fixture's logged income − spending for 2025
		expect(other.value).toBe(745.5); // the remainder
		expect((saved.value ?? 0) + (other.value ?? 0)).toBe(3000);
	});

	it('the two terms still add to the change over all time', () => {
		const saved = scalar('networth.saved');
		const other = scalar('networth.other');

		// lifetime opens at the first snapshot (1000) and closes at 6000
		expect((saved.value ?? 0) + (other.value ?? 0)).toBe(5000);
		expect(saved.value).toBe(2180 + 2254.5);
	});

	it('reports each term’s share of the change in its note', () => {
		expect(scalar('networth.saved', { level: 'year', year: 2025 }).note).toBe('75% of the change');
		expect(scalar('networth.other', { level: 'year', year: 2025 }).note).toBe('25% of the change');
	});

	it('net worth carries the period’s change as a delta', () => {
		const s = scalar('networth.change', { level: 'year', year: 2025 });
		expect(s.value).toBe(6000);
		expect(s.delta?.value).toBe(3000);
		expect(s.delta?.dir).toBe('up');
	});

	it('per-year bars pair saved against everything else', () => {
		const p = build(makeNetWorthData(), 'networth.saved_vs_other', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.series.map((s) => s.name)).toEqual(['You saved', 'Market & other']);
		expect(p.labels).toEqual(['2024', '2025']);
		// 2025's pair matches the scalars above
		expect(p.series[0]!.points[1]!.value).toBe(2254.5);
		expect(p.series[1]!.points[1]!.value).toBe(745.5);
	});

	it('is null when there are no snapshots to bound a period', () => {
		expect((build(makeData(), 'networth.other', { level: 'all' }) as Scalar).value).toBeNull();
	});
});

// --- targets derived from spending ---

describe('targets', () => {
	// The fixture logs 120 + 45.5 over two months → an annualized 993/yr, 82.75/mo.
	it('sizes the FI number from trailing spending at the stated rate', () => {
		const s = scalar('networth.fi_number');
		expect(s.value).toBeCloseTo(993 / 0.04, 5);
		expect(s.note).toContain('at 4%');
	});

	it('honours a changed withdrawal rate', () => {
		const data = makeNetWorthData();
		data.settings!.swr = 5;
		expect((build(data, 'networth.fi_number', { level: 'all' }) as Scalar).value).toBeCloseTo(
			993 / 0.05,
			5
		);
	});

	it('falls back to 4% when settings are absent', () => {
		const data = makeNetWorthData();
		data.settings = null;
		expect((build(data, 'networth.fi_number', { level: 'all' }) as Scalar).value).toBeCloseTo(
			993 / 0.04,
			5
		);
	});

	it('reports FI progress as a percentage of that number', () => {
		const s = scalar('networth.fi_progress');
		expect(s.unit).toEqual(PERCENT);
		expect(s.value).toBeCloseTo((6000 / (993 / 0.04)) * 100, 5);
	});

	it('measures years of freedom against annual spending', () => {
		const s = scalar('networth.years_of_freedom');
		expect(s.unit).toEqual(YEARS);
		expect(s.value).toBeCloseTo(6000 / 993, 5);
	});

	it('measures runway from liquid cash against monthly spending', () => {
		const s = scalar('networth.runway');
		expect(s.unit).toEqual(MONTHS);
		expect(s.value).toBeCloseTo(1300 / (993 / 12), 5);
	});

	it('hides Coast FI until a birth year is set, and says why', () => {
		const without = scalar('networth.coast_fi');
		expect(without.value).toBeNull();
		expect(without.note).toContain('birth year');

		const data = makeNetWorthData();
		data.settings!.birth_year = 1990;
		const withYear = build(data, 'networth.coast_fi', { level: 'all' }) as Scalar;
		expect(withYear.value).not.toBeNull();
		expect(withYear.value!).toBeGreaterThan(0);
	});
});

// --- rates and risk ---

describe('rates and risk', () => {
	it('labels compound growth as a balance figure, not a return', () => {
		const s = scalar('networth.balance_growth');
		expect(s.label).toBe('Balance growth');
		expect(s.note).toContain('not a return');
		// 1000 → 6000 over ~1.4 years is a large but finite annualized figure
		expect(s.value!).toBeGreaterThan(100);
	});

	it('reports the largest account as a share of assets, and names it', () => {
		const s = scalar('networth.top_account');
		// assets are 3000 + 2000 + 1500; the liability is excluded
		expect(s.value).toBeCloseTo((3000 / 6500) * 100, 5);
		expect(s.note).toContain('Big');
	});
});

// --- allocation and accounts ---

describe('allocation and accounts', () => {
	it('reports each bucket as a share of assets, not a dollar level', () => {
		const p = build(makeNetWorthData(), 'networth.allocation_share', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.unit).toEqual(PERCENT);
		// the last snapshot holds 1300 / 2600 / 2600 against 6500 of assets
		expect(p.series.map((s) => s.points[2]!.value)).toEqual([20, 40, 40]);
	});

	it('lists asset accounts in one ranked set, largest first', () => {
		const p = build(makeNetWorthData(), 'networth.accounts', { level: 'all' });
		if (p.kind !== 'categorical') throw new Error('expected categorical');
		// Liabilities are excluded: a negative bar has no share of a whole.
		expect(p.points.map((pt) => pt.key)).toEqual(['Big', 'Bank', 'Plan']);
	});

	it('keeps liabilities on their own series so the net-worth axis stays readable', () => {
		const trend = build(makeNetWorthData(), 'networth.by_month', { level: 'all' });
		if (trend.kind !== 'series') throw new Error('expected series');
		expect(trend.name).toBe('Net worth');

		const liabilities = build(makeNetWorthData(), 'networth.liabilities_trend', { level: 'all' });
		if (liabilities.kind !== 'series') throw new Error('expected series');
		// the fixture only carries a liability on its last snapshot
		expect(liabilities.points.map((pt) => pt.value)).toEqual([0, 0, 500]);
	});
});

// --- the duration unit ---

describe('duration formatting', () => {
	it('renders months and years with one decimal', () => {
		expect(formatUnit(14.62, MONTHS)).toBe('14.6 mo');
		expect(formatUnit(9.3, YEARS)).toBe('9.3 yr');
	});

	it('keeps durations of different periods incompatible', () => {
		expect(dataOfKind('scalar').length).toBeGreaterThan(0); // sanity: registry loaded
		expect(formatUnit(1, MONTHS)).not.toBe(formatUnit(1, YEARS));
	});
});

// --- the chart treatments the page relies on ---

describe('thresholds bullet', () => {
	it('measures runway against the target from settings, not a constant', () => {
		const data = makeNetWorthData();
		data.settings!.runway_target = 9;
		const p = build(data, 'networth.thresholds', { level: 'all' });
		if (p.kind !== 'bullet') throw new Error('expected bullet');

		const runway = p.rows.find((r) => r.label === 'Cash runway')!;
		expect(runway.target).toBe(9);
		// bands track the target, so changing it moves the shading with it
		expect(runway.bands).toEqual([4.5, 9]);
	});

	it('reuses the same figures as the tiles, so a gauge cannot disagree with them', () => {
		const data = makeNetWorthData();
		const p = build(data, 'networth.thresholds', { level: 'all' });
		if (p.kind !== 'bullet') throw new Error('expected bullet');

		const runway = p.rows.find((r) => r.label === 'Cash runway')!;
		const tile = build(data, 'networth.runway', { level: 'all' }) as Scalar;
		expect(runway.value).toBe(tile.value);
		expect(runway.unit).toEqual(MONTHS);
	});

	it('drops a row it cannot compute rather than drawing it empty', () => {
		// Coast FI needs a birth year; the fixture leaves it unset.
		const withoutBirthYear = build(makeNetWorthData(), 'networth.thresholds', { level: 'all' });
		if (withoutBirthYear.kind !== 'bullet') throw new Error('expected bullet');
		expect(withoutBirthYear.rows.map((r) => r.label)).toEqual(['Cash runway', 'FI number']);

		const data = makeNetWorthData();
		data.settings!.birth_year = 1990;
		const withIt = build(data, 'networth.thresholds', { level: 'all' });
		if (withIt.kind !== 'bullet') throw new Error('expected bullet');
		expect(withIt.rows.map((r) => r.label)).toContain('Coast FI');
	});

	it('measures percentage rows against a full 100', () => {
		const p = build(makeNetWorthData(), 'networth.thresholds', { level: 'all' });
		if (p.kind !== 'bullet') throw new Error('expected bullet');

		const fi = p.rows.find((r) => r.label === 'FI number')!;
		expect(fi.unit).toEqual(PERCENT);
		expect(fi.target).toBe(100);
	});
});

describe('net worth against assets', () => {
	it('plots both readings so the gap reads as what is owed', () => {
		const p = build(makeNetWorthData(), 'networth.vs_assets', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.series.map((s) => s.name)).toEqual(['Net worth', 'Assets']);
		// the fixture's last snapshot owes 500, so assets sit exactly that far above net worth
		const [nw, assets] = p.series;
		expect(assets!.points[2]!.value! - nw!.points[2]!.value!).toBe(500);
	});
});
