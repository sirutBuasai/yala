import { describe, expect, it } from 'vitest';
import type { MultiSeries, Series } from '$lib/data/primitives';
import { YEAR } from '$lib/data/primitives';
import type { Assumptions } from '$lib/data/assumptions';
import {
	balanceAtRetirement,
	breakEven,
	depletionYear,
	investedProjection,
	lastsToHorizon,
	secondaryLines
} from '$lib/data/projection';
import { fiNumber, plannedRates, trailingAnnual } from '$lib/data/networth';
import { makeData, makeNetWorthData } from '$lib/data/__fixtures__/dashboard';

const THIS_YEAR = new Date().getFullYear();

/** The invested part of the fixture's position: everything but the Liquid bucket. */
const INVESTED = 2600 + 2600;

/**
 * Assumptions naming the REAL rate directly. Inflation is zeroed, which makes the nominal figure and the
 * real one the same number — so an expectation can state the rate the projection actually compounds at
 * without restating the Fisher step (which `assumptions.test.ts` covers on its own).
 */
const assume = ({
	realReturn = 5,
	...over
}: Partial<Assumptions> & { realReturn?: number } = {}): Assumptions => ({
	swr: 4,
	nominalReturn: realReturn,
	inflation: 0,
	retireAge: 60,
	runwayTarget: 6,
	horizonAge: 95,
	birthYear: THIS_YEAR - 30,
	plannedSpending: null,
	outOfPocket: null,
	...over
});

function lineNamed(p: MultiSeries, name: string): Series {
	const found = p.series.find((s) => s.name === name);
	if (!found) throw new Error(`no ${name} line`);
	return found;
}

const valuesOf = (p: MultiSeries, name: string) =>
	lineNamed(p, name).points.map((pt) => pt.value ?? 0);

describe('projection', () => {
	it('runs from this year to the horizon age', () => {
		const a = assume({ horizonAge: 90 });
		const p = investedProjection(makeNetWorthData(), a);

		expect(p.labels[0]).toBe(String(THIS_YEAR));
		expect(p.labels.at(-1)).toBe(String(a.birthYear! + 90));
	});

	// The horizon is a setting, so moving it has to move the axis rather than a hardcoded end age.
	it('follows the horizon age it is given', () => {
		const data = makeNetWorthData();
		const short = investedProjection(data, assume({ horizonAge: 70 }));
		const long = investedProjection(data, assume({ horizonAge: 110 }));

		expect(long.labels.length - short.labels.length).toBe(40);
	});

	it('starts from the invested balance, not net worth', () => {
		const p = investedProjection(makeNetWorthData(), assume());
		expect(valuesOf(p, 'Investing')[0]).toBe(INVESTED);
		expect(valuesOf(p, 'Coasting')[0]).toBe(INVESTED);
	});

	it('draws both targets flat, the finite one named for the horizon', () => {
		const p = investedProjection(makeNetWorthData(), assume({ horizonAge: 90 }));

		expect(p.series.map((s) => s.name)).toEqual([
			'Investing',
			'Coasting',
			'FI number',
			'Lasts to 90'
		]);
		for (const name of ['FI number', 'Lasts to 90']) {
			expect(new Set(valuesOf(p, name)).size, name).toBe(1);
		}
	});

	it('names every line read against the investing one, so a caller can dot them all', () => {
		const a = assume({ horizonAge: 88 });
		expect(secondaryLines(a)).toEqual(['Coasting', 'FI number', 'Lasts to 88']);

		const drawn = investedProjection(makeNetWorthData(), a).series.map((s) => s.name);
		expect(drawn.filter((n) => n !== 'Investing')).toEqual(secondaryLines(a));
	});

	// The gap between the two lines IS the value of continuing to save, so it must open up and stay open.
	it('keeps the investing line above the coasting one once contributions start landing', () => {
		const data = makeNetWorthData();
		expect(trailingAnnual(data, 'saved')).toBeGreaterThan(0);

		const p = investedProjection(data, assume());
		const investing = valuesOf(p, 'Investing');
		const coasting = valuesOf(p, 'Coasting');

		expect(investing[1]).toBeGreaterThan(coasting[1]!);
		investing.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(coasting[i]!));
	});

	it('compounds and contributes, year by year, up to the retirement year', () => {
		const data = makeNetWorthData();
		const a = assume({ realReturn: 6 });
		const contribution = trailingAnnual(data, 'saved');
		const investing = valuesOf(investedProjection(data, a), 'Investing');

		expect(investing[1]).toBeCloseTo(INVESTED * 1.06 + contribution, 5);
		expect(investing[2]).toBeCloseTo(investing[1]! * 1.06 + contribution, 5);
	});

	// A percentage withdrawal can never exhaust a portfolio, which would make the depletion metric
	// unanswerable. Trailing spending in real dollars can, and that is the point.
	it('withdraws trailing spending past the retirement year, not a share of the balance', () => {
		const data = makeNetWorthData();
		// Retiring this year, so the very next step is already a withdrawal.
		const a = assume({ birthYear: THIS_YEAR - 60 });
		const spend = trailingAnnual(data, 'spending');
		const coasting = valuesOf(investedProjection(data, a), 'Coasting');

		expect(coasting[1]).toBeCloseTo(INVESTED * 1.05 - spend, 5);
	});

	// Past zero the balance is spent; a line diving negative would read as a debt never taken on.
	it('floors a spent balance at zero rather than going negative', () => {
		const values = valuesOf(
			investedProjection(makeNetWorthData(), assume({ birthYear: THIS_YEAR - 60, realReturn: 0 })),
			'Coasting'
		);

		expect(Math.min(...values)).toBe(0);
		expect(values.at(-1)).toBe(0);
	});

	it('has nothing to draw without a birth year to place the retirement year', () => {
		const p = investedProjection(makeNetWorthData(), assume({ birthYear: null }));
		expect(p.labels).toEqual([]);
		expect(p.series).toEqual([]);
	});

	it('has nothing to draw before anything is snapshotted', () => {
		expect(investedProjection(makeData(), assume()).series).toEqual([]);
	});

	it('defaults to what the ledger states when no assumptions are given', () => {
		const data = makeNetWorthData();
		data.settings!.birth_year = THIS_YEAR - 30;
		data.settings!.horizon_age = 100;

		expect(investedProjection(data).labels.at(-1)).toBe(String(THIS_YEAR - 30 + 100));
	});

	it('honours a return the caller passes rather than the one the ledger stores', () => {
		const data = makeNetWorthData();
		const slow = valuesOf(investedProjection(data, assume({ realReturn: 1 })), 'Investing');
		const fast = valuesOf(investedProjection(data, assume({ realReturn: 9 })), 'Investing');

		expect(fast[1]).toBeGreaterThan(slow[1]!);
	});
});

describe('planned rates', () => {
	/**
	 * "Saved" is income less spending — a residual, not a measured flow into the market. Payroll
	 * contributions ARE measured and always land there; the leftover is money that merely went unspent, so
	 * how much of it is invested is a choice. Assuming all of it was overstating the rate.
	 */
	it('splits saved into contributions, which always invest, and a leftover that need not', () => {
		const data = makeNetWorthData();
		const contributions = trailingAnnual(data, 'contributions');
		const saved = trailingAnnual(data, 'saved');
		expect(contributions).toBeGreaterThan(0);

		const all = plannedRates(data, assume());
		expect(all.contributions).toBeCloseTo(contributions, 5);
		expect(all.residual).toBeCloseTo(saved - contributions, 5);
		// Unset invests the whole leftover, which is what the projection did before there was a control.
		expect(all.investing).toBeCloseTo(saved, 5);

		const none = plannedRates(data, assume({ outOfPocket: 0 }));
		expect(none.investing).toBeCloseTo(contributions, 5);
	});

	// Deliberately NOT capped at the leftover: money can be moved into the market from anywhere, so
	// planning to invest more than last year's residual is a plan, not an error to clamp away.
	it('lets you plan to invest more than last year left over', () => {
		const data = makeNetWorthData();
		const contributions = trailingAnnual(data, 'contributions');
		const rates = plannedRates(data, assume({ outOfPocket: 50_000 }));

		expect(rates.residual).toBeLessThan(50_000);
		expect(rates.investing).toBeCloseTo(contributions + 50_000, 5);
	});

	it('plans against the spending stated, else the spending logged', () => {
		const data = makeNetWorthData();
		expect(plannedRates(data, assume()).spending).toBeCloseTo(trailingAnnual(data, 'spending'), 5);
		expect(plannedRates(data, assume({ plannedSpending: 40000 })).spending).toBe(40000);
	});

	// Every target divides planned spending, so raising it has to raise the FI number with it.
	it('sizes the FI number from planned spending, not logged spending', () => {
		const data = makeNetWorthData();
		const a = assume({ plannedSpending: 40000, swr: 4 });

		expect(fiNumber(data, a).value).toBeCloseTo(40000 / 0.04, 5);
	});

	it('drives the projection from the planned rates', () => {
		const data = makeNetWorthData();
		const lean = valuesOf(investedProjection(data, assume({ outOfPocket: 0 })), 'Investing');
		const full = valuesOf(investedProjection(data, assume()), 'Investing');

		expect(full[1]).toBeGreaterThan(lean[1]!);
	});
});

describe('break-even', () => {
	/**
	 * The level that actually decides whether a balance lasts. Comparing the withdrawal RATE against the
	 * return only describes a portfolio sitting exactly at the FI number, which is how a warning came to
	 * claim a balance could not last while the chart correctly drew it rising forever.
	 */
	it('is the balance whose return alone covers planned spending', () => {
		const data = makeNetWorthData();
		const a = assume({ realReturn: 5, plannedSpending: 50000 });

		expect(breakEven(data, a)).toBeCloseTo(50000 / 0.05, 5);
	});

	it('has no answer with no return to live off', () => {
		expect(breakEven(makeNetWorthData(), assume({ realReturn: 0 }))).toBeNull();
	});

	// A balance past break-even earns more than it pays out, so it grows through retirement however high
	// the stated withdrawal rate is — which is exactly what the chart shows.
	it('a balance above it never depletes, whatever the withdrawal rate says', () => {
		const data = makeNetWorthData();
		const a = assume({ realReturn: 5, swr: 20, plannedSpending: 1 });

		expect(balanceAtRetirement(data, a)!).toBeGreaterThan(breakEven(data, a)!);
		expect(depletionYear(data, a).value).toBeNull();
	});

	it('reads the coasting balance at the retirement year', () => {
		const data = makeNetWorthData();
		const a = assume({ retireAge: 60, realReturn: 5 });
		const p = investedProjection(data, a);
		const at = p.labels.indexOf(String(a.birthYear! + 60));

		expect(balanceAtRetirement(data, a)).toBeCloseTo(valuesOf(p, 'Coasting')[at]!, 5);
	});
});

describe('lasts to the horizon', () => {
	/**
	 * The figure has to be the pot that reaches exactly zero at the horizon. Simulated rather than
	 * asserted against a constant, because the naive `spend × years` answer is nearly twice as large and
	 * a formula slip would still look plausible.
	 */
	it('funds spending to the horizon and lands on zero', () => {
		const data = makeNetWorthData();
		const a = assume({ realReturn: 5, retireAge: 60, horizonAge: 80 });
		const spend = trailingAnnual(data, 'spending');
		const start = lastsToHorizon(data, a)!;

		let balance = start;
		for (let year = 0; year < 20; year++) balance = balance * 1.05 - spend;

		expect(balance).toBeCloseTo(0, 4);
		// Most of what a long drawdown pays out is return, not principal — which is why the pot is far
		// smaller than the total it funds.
		expect(start).toBeLessThan(spend * 20);
	});

	it('is just the total drawn when nothing is earned on the way down', () => {
		const data = makeNetWorthData();
		const spend = trailingAnnual(data, 'spending');
		const a = assume({ realReturn: 0, retireAge: 60, horizonAge: 90 });

		expect(lastsToHorizon(data, a)).toBeCloseTo(spend * 30, 5);
	});

	// It is allowed to reach zero; the FI number never is. So it must always be the smaller target.
	it('sits below the FI number whenever the rate is one the balance could sustain', () => {
		const data = makeNetWorthData();
		const a = assume({ swr: 4, realReturn: 5 });

		expect(lastsToHorizon(data, a)!).toBeLessThan(fiNumber(data, a).value!);
	});

	it('is null when the horizon is not past retirement', () => {
		expect(
			lastsToHorizon(makeNetWorthData(), assume({ retireAge: 90, horizonAge: 90 }))
		).toBeNull();
	});
});

describe('depletion year', () => {
	it('names the first year the investing line is spent', () => {
		const data = makeNetWorthData();
		const a = assume({ birthYear: THIS_YEAR - 60, realReturn: 0 });
		const p = investedProjection(data, a);

		const s = depletionYear(data, a);
		expect(s.unit).toEqual(YEAR);
		expect(s.value).toBe(Number(p.labels[valuesOf(p, 'Investing').indexOf(0)]));
	});

	// A year is a point on the calendar, so it must not be grouped like a quantity.
	it('renders the year without a thousands separator', () => {
		const s = depletionYear(
			makeNetWorthData(),
			assume({ birthYear: THIS_YEAR - 60, realReturn: 0 })
		);
		expect(String(s.value)).not.toContain(',');
	});

	it('is null where the balance never runs out, and says so', () => {
		// A return that outruns the withdrawal: the balance grows through retirement instead.
		const s = depletionYear(makeNetWorthData(), assume({ realReturn: 20 }));

		expect(s.value).toBeNull();
		expect(s.note).toEqual({ text: 'never at this rate' });
	});

	it('is null without a birth year, like the projection it reads', () => {
		expect(depletionYear(makeNetWorthData(), assume({ birthYear: null })).value).toBeNull();
	});
});
