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
		const saved = scalar('networth.saved', { level: 'year', year: 2025 });
		const other = scalar('networth.other', { level: 'year', year: 2025 });

		expect(saved.value).toBe(2254.5);
		expect(other.value).toBe(745.5);
		expect((saved.value ?? 0) + (other.value ?? 0)).toBe(3000);
	});

	it('the two terms still add to the change over all time', () => {
		const saved = scalar('networth.saved');
		const other = scalar('networth.other');

		expect((saved.value ?? 0) + (other.value ?? 0)).toBe(5000);
		expect(saved.value).toBe(2180 + 2254.5);
	});

	it('reports each term’s share of the change in its note', () => {
		expect(scalar('networth.saved', { level: 'year', year: 2025 }).note).toEqual({
			context: '75% of the change'
		});
		expect(scalar('networth.other', { level: 'year', year: 2025 }).note).toEqual({
			context: '25% of the change'
		});
	});

	it('net worth carries the period’s change as a delta', () => {
		const s = scalar('networth.change', { level: 'year', year: 2025 });
		expect(s.value).toBe(6000);
		expect(s.delta?.value).toBe(3000);
		expect(s.delta?.tone).toBe('good');
	});

	it('per-year bars pair saved against everything else', () => {
		const p = build(makeNetWorthData(), 'networth.saved_vs_other', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.series.map((s) => s.name)).toEqual(['You saved', 'Market & other']);
		expect(p.labels).toEqual(['2024', '2025']);
		expect(p.series[0]!.points[1]!.value).toBe(2254.5);
		expect(p.series[1]!.points[1]!.value).toBe(745.5);
	});

	it('is null when there are no snapshots to bound a period', () => {
		expect((build(makeData(), 'networth.other', { level: 'all' }) as Scalar).value).toBeNull();
	});
});

// --- targets derived from spending ---

// The fixture's logged spending, annualized and per month, plus the balances the targets divide it
// into. Named so a fixture edit lands in one place rather than across every expectation.
const ANNUAL_SPEND = 993;
const MONTHLY_SPEND = ANNUAL_SPEND / 12;
const NET_WORTH = 6000;
const LIQUID = 1300;
const DEFAULT_SWR = 0.04;

describe('targets', () => {
	it('sizes the FI number from trailing spending at the stated rate', () => {
		const s = scalar('networth.fi_number');
		expect(s.value).toBeCloseTo(ANNUAL_SPEND / DEFAULT_SWR, 5);
		expect(s.note?.context).toContain('at 4%');
	});

	it('honours a changed withdrawal rate', () => {
		const data = makeNetWorthData();
		data.settings!.swr = 5;
		expect((build(data, 'networth.fi_number', { level: 'all' }) as Scalar).value).toBeCloseTo(
			ANNUAL_SPEND / 0.05,
			5
		);
	});

	it('falls back to 4% when settings are absent', () => {
		const data = makeNetWorthData();
		data.settings = null;
		expect((build(data, 'networth.fi_number', { level: 'all' }) as Scalar).value).toBeCloseTo(
			ANNUAL_SPEND / DEFAULT_SWR,
			5
		);
	});

	it('reports FI progress as a percentage of that number', () => {
		const s = scalar('networth.fi_progress');
		expect(s.unit).toEqual(PERCENT);
		expect(s.value).toBeCloseTo((NET_WORTH / (ANNUAL_SPEND / DEFAULT_SWR)) * 100, 5);
	});

	it('measures years of freedom against annual spending', () => {
		const s = scalar('networth.years_of_freedom');
		expect(s.unit).toEqual(YEARS);
		expect(s.value).toBeCloseTo(NET_WORTH / ANNUAL_SPEND, 5);
	});

	// The lifestyle it measures against is the recent one, so more spending has to shorten it.
	it('shortens years of freedom when recent spending rises', () => {
		const before = scalar('networth.years_of_freedom').value!;
		const data = makeNetWorthData();
		data.months['2025-01']!.total_spent = 4000;
		const after = (build(data, 'networth.years_of_freedom', { level: 'all' }) as Scalar).value!;
		expect(after).toBeLessThan(before);
	});

	it('measures runway from liquid cash against monthly spending', () => {
		const s = scalar('networth.runway');
		expect(s.unit).toEqual(MONTHS);
		expect(s.value).toBeCloseTo(LIQUID / MONTHLY_SPEND, 5);
	});

	it('hides Coast FI until a birth year is set, and says why', () => {
		const without = scalar('networth.coast_fi');
		expect(without.value).toBeNull();
		expect(without.note?.text).toContain('birth year');

		const data = makeNetWorthData();
		data.settings!.birth_year = 1990;
		const withYear = build(data, 'networth.coast_fi', { level: 'all' }) as Scalar;
		expect(withYear.value).not.toBeNull();
		expect(withYear.value!).toBeGreaterThan(0);
	});
});

// --- rates and risk ---

describe('rates and risk', () => {
	it('labels compound growth as a balance figure, contributions included', () => {
		const s = scalar('networth.balance_growth');
		expect(s.label).toEqual({ text: 'Balance growth' });
		expect(s.note?.text).toContain('including contributions');
		expect(s.value!).toBeGreaterThan(100);
	});

	it('reports the largest account as a share of assets, and names it', () => {
		const s = scalar('networth.top_account');
		// The liability is excluded from the denominator.
		expect(s.value).toBeCloseTo((3000 / 6500) * 100, 5);
		expect(s.note?.context).toContain('BrokerageA');
	});
});

// --- allocation and accounts ---

describe('allocation and accounts', () => {
	it('reports each bucket as a share of assets, not a dollar level', () => {
		const p = build(makeNetWorthData(), 'networth.allocation_share', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.unit).toEqual(PERCENT);
		expect(p.series.map((s) => s.points[2]!.value)).toEqual([20, 40, 40]);
	});

	it('lists asset accounts in one ranked set, largest first', () => {
		const p = build(makeNetWorthData(), 'networth.accounts', { level: 'all' });
		if (p.kind !== 'categorical') throw new Error('expected categorical');
		// Liabilities are excluded: a negative bar has no share of a whole.
		expect(p.points.map((pt) => pt.key)).toEqual(['BrokerageA', 'BankA', 'PlanA']);
	});

	it('keeps liabilities on their own series so the net-worth axis stays readable', () => {
		const trend = build(makeNetWorthData(), 'networth.by_month', { level: 'all' });
		if (trend.kind !== 'series') throw new Error('expected series');
		expect(trend.name).toBe('Net worth');

		const liabilities = build(makeNetWorthData(), 'networth.liabilities_trend', { level: 'all' });
		if (liabilities.kind !== 'series') throw new Error('expected series');
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
		expect(dataOfKind('scalar').length).toBeGreaterThan(0);
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
		// Bands track the target, so changing it moves the shading with it.
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
		// Assets sit above net worth by exactly what is owed.
		const [nw, assets] = p.series;
		expect(assets!.points[2]!.value! - nw!.points[2]!.value!).toBe(500);
	});
});

describe('year-end levels behind a KPI', () => {
	it('plots one bar per logged year, at the value each year closed on', () => {
		const p = build(makeNetWorthData(), 'networth.by_year', { level: 'all' });
		if (p.kind !== 'series') throw new Error('expected series');

		expect(p.points.map((pt) => pt.label)).toEqual(['2024', '2025']);
		// A year closes on its last snapshot, not its first.
		expect(p.points.map((pt) => pt.value)).toEqual([3000, 6000]);
	});

	it('looks back ten years and no further', () => {
		const data = makeNetWorthData();
		data.networth!.series = Array.from({ length: 14 }, (_, i) => ({
			date: `${2012 + i}-12-01`,
			assets: 100 * (i + 1),
			liabilities: 0,
			net_worth: 100 * (i + 1),
			breakdown: { Liquid: 100 * (i + 1), Taxable: 0, 'Tax-advantaged': 0 }
		}));

		const p = build(data, 'networth.by_year', { level: 'all' });
		if (p.kind !== 'series') throw new Error('expected series');

		expect(p.points).toHaveLength(10);
		expect(p.points[0]!.label).toBe('2016');
		expect(p.points.at(-1)!.label).toBe('2025');
	});
});

// --- how a snapshot's date reads on an axis ---

/** The fixture with two balances logged in one month, which is what forces the day into the label. */
function twiceInAugust() {
	const data = makeNetWorthData();
	data.networth!.series = [
		{
			date: '2025-08-01',
			assets: 1000,
			liabilities: 0,
			net_worth: 1000,
			breakdown: { Liquid: 400, Taxable: 600, 'Tax-advantaged': 0 }
		},
		{
			date: '2025-08-26',
			assets: 1200,
			liabilities: 0,
			net_worth: 1200,
			breakdown: { Liquid: 400, Taxable: 800, 'Tax-advantaged': 0 }
		}
	];
	return data;
}

describe('snapshot date labels', () => {
	it('states the day within a year, where the header already says which year it is', () => {
		const p = build(makeNetWorthData(), 'networth.by_month', { level: 'year', year: 2025 });
		if (p.kind !== 'series') throw new Error('expected series');

		expect(p.points.map((pt) => pt.label)).toEqual(['Jun 1']);
	});

	it('states the month and year over a lifetime, where no header can', () => {
		const p = build(makeNetWorthData(), 'networth.by_month', { level: 'all' });
		if (p.kind !== 'series') throw new Error('expected series');

		expect(p.points.map((pt) => pt.label)).toEqual(['Jan 2024', 'Dec 2024', 'Jun 2025']);
	});

	it('keeps two balances logged in one month as two points', () => {
		const p = build(twiceInAugust(), 'networth.by_month', { level: 'year', year: 2025 });
		if (p.kind !== 'series') throw new Error('expected series');

		// Charts key their axis ticks by slot for exactly this case, but the labels must still differ or
		// the two points are indistinguishable to a reader.
		expect(p.points.map((pt) => pt.label)).toEqual(['Aug 1', 'Aug 26']);
	});

	it('labels the monthly table the same way as the chart beside it', () => {
		const p = build(twiceInAugust(), 'networth.monthly_table', { level: 'year', year: 2025 });
		if (p.kind !== 'table') throw new Error('expected table');

		expect(p.rows.map((r) => r[0])).toEqual(['Aug 1', 'Aug 26']);
	});
});

// --- month-over-month movement ---

describe('the monthly table', () => {
	it('follows every level with its own change and percentage', () => {
		const p = build(makeNetWorthData(), 'networth.monthly_table', { level: 'year', year: 2025 });
		if (p.kind !== 'table') throw new Error('expected table');

		expect(p.columns.map((c) => c.label)).toEqual([
			'Date',
			'Net worth',
			'Change',
			'Change %',
			'Assets',
			'Change',
			'Change %',
			'Liabilities',
			'Change',
			'Change %'
		]);
	});

	// Three columns share the heading 'Change', which is only safe because the header is keyed by
	// position; keying it by label crashes the table.
	it('repeats a heading rather than qualifying it', () => {
		const p = build(makeNetWorthData(), 'networth.monthly_table', { level: 'year', year: 2025 });
		if (p.kind !== 'table') throw new Error('expected table');

		const labels = p.columns.map((c) => c.label);
		expect(labels.filter((l) => l === 'Change')).toHaveLength(3);
		expect(new Set(labels).size).toBeLessThan(labels.length);
	});

	it('measures each level against the snapshot before it, not against the year', () => {
		const p = build(twiceInAugust(), 'networth.monthly_table', { level: 'year', year: 2025 });
		if (p.kind !== 'table') throw new Error('expected table');

		// Nothing precedes the first snapshot, so it has no move to report.
		expect(p.rows[0]!.slice(1, 4)).toEqual([1000, 0, 0]);
		expect(p.rows[1]!.slice(1, 4)).toEqual([1200, 200, 20]);
	});

	it('shades the movement columns only, since a balance has no good direction', () => {
		const p = build(makeNetWorthData(), 'networth.monthly_table', { level: 'year', year: 2025 });
		if (p.kind !== 'table') throw new Error('expected table');

		const tinted = p.columns.map((c) => !!c.tint);
		// Date, then each level unshaded with its two movement columns shaded.
		expect(tinted).toEqual([false, false, true, true, false, true, true, false, true, true]);
	});

	it('shades a rise in what you owe as bad news, unlike a rise in the other two', () => {
		const p = build(makeNetWorthData(), 'networth.monthly_table', { level: 'year', year: 2025 });
		if (p.kind !== 'table') throw new Error('expected table');

		const dirOf = (label: string) => {
			const at = p.columns.findIndex((c) => c.label === label);
			return p.columns[at + 1]!.tint;
		};
		expect(dirOf('Net worth')).toBe('up-good');
		expect(dirOf('Assets')).toBe('up-good');
		expect(dirOf('Liabilities')).toBe('up-bad');
	});
});

describe('change by month', () => {
	const atYear: Scope = { level: 'year', year: 2025 };
	const changeOf = (id: string) => {
		const p = build(makeNetWorthData(), id, atYear);
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');
		return p;
	};

	it('plots the two levels that can share one chart, as percentages', () => {
		const p = changeOf('networth.change_by_month');

		expect(p.unit).toEqual(PERCENT);
		expect(p.series.map((s) => s.name)).toEqual(['Net worth', 'Assets']);
		// 3000 → 6000 is +100%; assets 3000 → 6500 is +116.67%.
		expect(p.series[0]!.points[0]!.value).toBeCloseTo(100, 5);
		expect(p.series[1]!.points[0]!.value).toBeCloseTo((3500 / 3000) * 100, 5);
	});

	// One chart, both units: a second chart of the dollars looks the same as the first, because the base
	// barely moves month to month.
	it('carries the dollar amount as the same points’ alternate reading', () => {
		const p = changeOf('networth.change_by_month');

		expect(p.series.every((s) => s.altUnit?.kind === 'money')).toBe(true);
		expect(p.series.map((s) => s.points[0]!.alt)).toEqual([3000, 3500]);
	});

	// Both change panes plot percentages, so a glance moves between them without changing units.
	it('plots liabilities in the same unit as the pair beside it', () => {
		const pair = changeOf('networth.change_by_month');
		const owed = changeOf('networth.liabilities_change');

		expect(owed.unit).toEqual(pair.unit);
		expect(owed.series[0]!.altUnit?.kind).toBe('money');
		expect(owed.series[0]!.points[0]!.alt).toBe(500);
	});

	it('reports nothing rather than infinity when a level opened at zero', () => {
		// Liabilities went 0 → 500: a rise off nothing has no percentage, though the dollars still read.
		expect(changeOf('networth.liabilities_change').series[0]!.points[0]!.value).toBe(0);
	});

	// Liabilities swing by hundreds of percent against net worth's single digits, so sharing one chart
	// flattens whichever level is smaller to nothing.
	it('keeps liabilities out of the shared chart, and alone in its own', () => {
		expect(changeOf('networth.change_by_month').series.map((s) => s.name)).not.toContain(
			'Liabilities'
		);
		expect(changeOf('networth.liabilities_change').series.map((s) => s.name)).toEqual([
			'Liabilities'
		]);
	});

	it('reports one move per month, however many balances were logged in it', () => {
		const p = build(twiceInAugust(), 'networth.change_by_month', atYear);
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.labels).toEqual(['Aug']);
		// The month opens at the balance it followed and closes at its last, so the two rows in the table
		// add up to this one bar: 1000 → 1200 is +$200, which is +20%.
		expect(p.series[0]!.points[0]!.value).toBeCloseTo(20, 5);
		expect(p.series[0]!.points[0]!.alt).toBe(200);
	});
});

// --- allocation as dollars rather than shares ---

describe('allocation by value', () => {
	it('reports each bucket’s balance, where the share view normalizes it away', () => {
		const p = build(makeNetWorthData(), 'networth.allocation_value', { level: 'all' });
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.unit.kind).toBe('money');
		expect(p.series.map((s) => s.name)).toEqual(['Liquid', 'Taxable', 'Tax-advantaged']);
		expect(p.series.map((s) => s.points[2]!.value)).toEqual([1300, 2600, 2600]);
	});

	it('draws the same buckets in the same order as the share view', () => {
		const share = build(makeNetWorthData(), 'networth.allocation_share', { level: 'all' });
		const value = build(makeNetWorthData(), 'networth.allocation_value', { level: 'all' });
		if (share.kind !== 'multiseries' || value.kind !== 'multiseries') {
			throw new Error('expected multiseries');
		}

		expect(value.series.map((s) => s.name)).toEqual(share.series.map((s) => s.name));
		expect(value.labels).toEqual(share.labels);
	});
});

// --- the decomposition, month by month and against last year ---

describe('monthly attribution', () => {
	it('plots one point per month a balance was logged in', () => {
		const p = build(makeNetWorthData(), 'networth.saved_vs_other_by_month', {
			level: 'year',
			year: 2025
		});
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		expect(p.labels).toEqual(['Jun']);
		expect(p.series.map((s) => s.name)).toEqual(['You saved', 'Market & other']);
	});

	it('splits each month’s move the way the year is split', () => {
		const p = build(makeNetWorthData(), 'networth.saved_vs_other_by_month', {
			level: 'year',
			year: 2025
		});
		if (p.kind !== 'multiseries') throw new Error('expected multiseries');

		// June opens at the December balance it followed, so its move is 6000 − 3000, none of it from
		// logged saving: the fixture logs nothing in June.
		const [saved, other] = p.series;
		expect(saved!.points[0]!.value).toBe(0);
		expect(other!.points[0]!.value).toBe(3000);
	});

	it('gives a KPI card the same monthly figures its pane draws', () => {
		const pane = build(makeNetWorthData(), 'networth.saved_vs_other_by_month', {
			level: 'year',
			year: 2025
		});
		const card = build(makeNetWorthData(), 'networth.other_by_month', {
			level: 'year',
			year: 2025
		});
		if (pane.kind !== 'multiseries' || card.kind !== 'series') throw new Error('wrong kind');

		expect(card.points).toEqual(pane.series[1]!.points);
	});
});

describe('the year against last year', () => {
	it('splits the year’s change into the two terms the cards carry', () => {
		const at: Scope = { level: 'year', year: 2025 };
		const change = scalar('networth.year_change', at);
		const saved = scalar('networth.year_saved', at);
		const other = scalar('networth.year_other', at);

		expect(change.value).toBe(3000);
		expect((saved.value ?? 0) + (other.value ?? 0)).toBe(3000);
		// The same figures the KPI cards read, so a matrix cell cannot disagree with the card above it.
		expect(saved.value).toBe(scalar('networth.saved', at).value);
		expect(other.value).toBe(scalar('networth.other', at).value);
	});

	it('badges each term against the same term a year earlier', () => {
		const at: Scope = { level: 'year', year: 2025 };

		// 2024 moved 1000 → 3000; 2025 moved 3000 → 6000.
		expect(scalar('networth.year_change', at).delta?.value).toBeCloseTo(50, 5);
		expect(scalar('networth.year_change', at).delta?.note).toBe('YoY');
		// 2024's remainder was negative, so the movement is measured off its magnitude.
		expect(scalar('networth.year_other', at).delta?.value).toBeCloseTo(
			((745.5 + 180) / 180) * 100,
			5
		);
	});

	it('leaves the badge off a year with nothing before it', () => {
		expect(scalar('networth.year_change', { level: 'year', year: 2024 }).delta).toBeUndefined();
	});

	it('divides the run-rate by the active months it states', () => {
		const at: Scope = { level: 'year', year: 2025 };
		const rate = scalar('avg.networth_change_per_month', at);

		// The fixture logs one active month in 2025, and the note is where that divisor is declared.
		expect(rate.note?.context).toBe('1 active months');
		expect(rate.value).toBe(3000);
	});

	it('names its columns the way the cards above them are named', () => {
		expect(CATALOG_BY_ID['networth.year_change']!.label).toBe('Change');
		expect(CATALOG_BY_ID['networth.year_saved']!.label).toBe('You saved');
		expect(CATALOG_BY_ID['networth.year_other']!.label).toBe('Market & other');
	});
});
