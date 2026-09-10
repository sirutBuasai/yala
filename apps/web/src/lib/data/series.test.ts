// One builder per SHAPE, any measure. These read the same aggregates the scalar metrics do, so what
// matters is that a series over a measure agrees with the figure for that measure at that scope.

import { describe, expect, it } from 'vitest';
import {
	accumulate,
	measureActive,
	measureByMonth,
	measureByYear,
	measureTrailing
} from '$lib/data/series';
import { measureValue } from '$lib/data/metric';
import { build } from '$lib/data/catalog';
import { makeData } from '$lib/data/__fixtures__/dashboard';

describe('measureByMonth', () => {
	it('plots a year as twelve calendar months', () => {
		const s = measureByMonth(makeData(), 'spending', 2025);
		expect(s.points).toHaveLength(12);
		expect(s.points[0]).toEqual({ label: 'Jan', value: 45.5 });
		expect(s.points[1]).toEqual({ label: 'Feb', value: 0 });
	});

	it('plots every tracked month when no year is given', () => {
		const s = measureByMonth(makeData(), 'income');
		expect(s.points.map((p) => p.label)).toEqual(['2024-12', '2025-01']);
		expect(s.points.map((p) => p.value)).toEqual([2300, 2300]);
	});

	it('names the series after the measure, which is what colours it', () => {
		expect(measureByMonth(makeData(), 'spending').name).toBe('Spent');
		expect(measureByMonth(makeData(), 'net').name).toBe('Net income');
	});

	it('handles any measure, including a paycheck line item', () => {
		const s = measureByMonth(makeData(), { group: 'deductions', key: 'Tax' }, 2025);
		expect(s.name).toBe('Tax');
		expect(s.points[0]!.value).toBe(600);
	});

	it('agrees with the scalar for the same measure and month', () => {
		const d = makeData();
		const s = measureByMonth(d, 'saved', 2025);
		expect(s.points[0]!.value).toBe(
			measureValue(d, { level: 'month', monthKey: '2025-01' }, 'saved')
		);
	});
});

describe('measureTrailing', () => {
	it('ends at the month asked for and reaches back over the window', () => {
		const s = measureTrailing(makeData(), 'spending', '2025-01', 3);
		expect(s.points.map((p) => p.label)).toEqual(['Nov', 'Dec', 'Jan']);
		expect(s.points.map((p) => p.value)).toEqual([0, 120, 45.5]);
	});

	it('crosses a year boundary rather than clamping at January', () => {
		const s = measureTrailing(makeData(), 'income', '2025-01', 2);
		expect(s.points.map((p) => p.value)).toEqual([2300, 2300]);
	});
});

describe('measureByYear', () => {
	it('plots one point per tracked year', () => {
		const s = measureByYear(makeData(), 'spending');
		expect(s.points).toEqual([
			{ label: '2024', value: 120 },
			{ label: '2025', value: 45.5 }
		]);
	});
});

describe('measureActive', () => {
	// The window a running total wants: padded to December it reaches its total partway across and
	// draws a flat line to the edge, which in a card-width chart is a solid block that says nothing.
	it('spans only the months the measure moved in', () => {
		const s = measureActive(makeData(), 'spending', 2025);
		expect(s.points).toEqual([{ label: 'Jan', value: 45.5 }]);
	});

	it('keeps a quiet month between two active ones, so the run stays continuous', () => {
		const d = makeData();
		d.months['2025-03'] = { ...d.months['2025-01']!, total_spent: 10, total_income: 0 };
		const s = measureActive(d, 'spending', 2025);
		expect(s.points.map((p) => p.label)).toEqual(['Jan', 'Feb', 'Mar']);
		expect(s.points.map((p) => p.value)).toEqual([45.5, 0, 10]);
	});

	it('is empty for a year the measure never moved in', () => {
		expect(measureActive(makeData(), 'spending', 2030).points).toEqual([]);
	});
});

describe('accumulate', () => {
	it('turns a series into its running total', () => {
		const s = accumulate(measureByYear(makeData(), 'spending'));
		expect(s.points.map((p) => p.value)).toEqual([120, 165.5]);
	});

	it('never decreases for a measure that cannot be negative', () => {
		const values = accumulate(measureActive(makeData(), 'gross', 2025)).points.map(
			(p) => p.value ?? 0
		);
		expect(values.every((v, i) => i === 0 || v >= values[i - 1]!)).toBe(true);
	});
});

describe('catalog series over measures', () => {
	it('reads a month scope as the trailing twelve, so a KPI shows recent shape', () => {
		const p = build(makeData(), 'trend.spending', { level: 'month', monthKey: '2025-01' });
		if (p.kind !== 'series') throw new Error('expected series');
		expect(p.points).toHaveLength(12);
		expect(p.points[11]).toEqual({ label: 'Jan', value: 45.5 });
	});

	it('reads a year scope as that year’s twelve months', () => {
		const p = build(makeData(), 'trend.income', { level: 'year', year: 2025 });
		if (p.kind !== 'series') throw new Error('expected series');
		expect(p.points.map((pt) => pt.label)).toHaveLength(12);
		expect(p.points[0]!.value).toBe(2300);
	});

	// The whole point of building the chart from the same aggregates: a running total drawn behind a
	// KPI has to ARRIVE at the number in front of it. Month and year scope read different sections of
	// the document for the paycheck measures, so this is the invariant that keeps them agreeing.
	it('a running total ends on the figure it is drawn behind', () => {
		const d = makeData();
		for (const f of ['gross', 'deductions', 'contributions', 'net', 'saved'] as const) {
			const p = build(d, `running.${f}`, { level: 'year', year: 2025 });
			if (p.kind !== 'series') throw new Error('expected series');
			expect(p.points.at(-1)!.value).toBeCloseTo(
				measureValue(d, { level: 'year', year: 2025 }, f),
				6
			);
		}
	});

	// Trimming the empty tail is the point: the accumulation has to reach the right-hand edge.
	it('a running total spans only the active months, so it fills its chart', () => {
		const p = build(makeData(), 'running.gross', { level: 'year', year: 2025 });
		if (p.kind !== 'series') throw new Error('expected series');
		expect(p.points.map((pt) => pt.label)).toEqual(['Jan']);
	});

	it('the revolving window is twelve months whatever the calendar says', () => {
		const p = build(makeData(), 'revolving.gross', { level: 'month', monthKey: '2025-01' });
		if (p.kind !== 'series') throw new Error('expected series');
		expect(p.points).toHaveLength(12);
		expect(p.points.at(-1)!.value).toBe(3000);
	});
});
