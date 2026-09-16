import { describe, expect, it } from 'vitest';
import {
	assumptionKey,
	assumptionsOf,
	realRate,
	yearsToRetirement,
	type Assumptions
} from '$lib/data/assumptions';
import { makeData, makeNetWorthData } from '$lib/data/__fixtures__/dashboard';

const THIS_YEAR = new Date().getFullYear();

describe('assumptions', () => {
	it('reads what the ledger states', () => {
		const data = makeNetWorthData();
		data.settings!.swr = 3.5;
		data.settings!.nominal_return = 7;
		data.settings!.inflation = 2;
		data.settings!.retire_age = 55;
		data.settings!.runway_target = 9;
		data.settings!.horizon_age = 90;
		data.settings!.birth_year = 1990;
		data.settings!.planned_spending = 70000;
		data.settings!.out_of_pocket = 12000;

		expect(assumptionsOf(data)).toEqual({
			swr: 3.5,
			nominalReturn: 7,
			inflation: 2,
			retireAge: 55,
			runwayTarget: 9,
			horizonAge: 90,
			birthYear: 1990,
			plannedSpending: 70000,
			outOfPocket: 12000
		});
	});

	// A snapshot taken before a setting existed carries no value for it, and every figure derived from one
	// must still come out — which is what the spec defaults are for.
	it('falls back to the spec defaults with no settings at all', () => {
		const data = makeData();
		data.settings = null;

		expect(assumptionsOf(data)).toEqual({
			swr: 4,
			nominalReturn: 8,
			inflation: 3,
			retireAge: 60,
			runwayTarget: 6,
			horizonAge: 95,
			birthYear: null,
			plannedSpending: null,
			outOfPocket: null
		});
	});

	it('leaves the birth year null rather than guessing an age', () => {
		expect(assumptionsOf(makeNetWorthData()).birthYear).toBeNull();
	});

	it('spells every setting key as the assumption it feeds', () => {
		expect(assumptionKey('swr')).toBe('swr');
		expect(assumptionKey('nominal-return')).toBe('nominalReturn');
		expect(assumptionKey('retire-age')).toBe('retireAge');
		expect(assumptionKey('runway-target')).toBe('runwayTarget');
		expect(assumptionKey('birth-year')).toBe('birthYear');
	});
});

describe('years to retirement', () => {
	const at = (birthYear: number | null, retireAge = 60) =>
		yearsToRetirement({
			swr: 4,
			nominalReturn: 8,
			inflation: 3,
			retireAge,
			runwayTarget: 6,
			horizonAge: 95,
			birthYear,
			plannedSpending: null,
			outOfPocket: null
		});

	it('counts from this year to the age stated', () => {
		expect(at(THIS_YEAR - 30, 60)).toBe(30);
	});

	it('is null without a birth year, which is the only source of how long you have', () => {
		expect(at(null)).toBeNull();
	});

	// Past the target age there is no negative runway to report; the answer is that it has arrived.
	it('floors at zero past the target age', () => {
		expect(at(THIS_YEAR - 70, 60)).toBe(0);
	});
});

describe('the real rate', () => {
	const at = (nominalReturn: number, inflation: number): Assumptions => ({
		swr: 4,
		nominalReturn,
		inflation,
		retireAge: 60,
		runwayTarget: 6,
		horizonAge: 95,
		birthYear: 1990,
		plannedSpending: null,
		outOfPocket: null
	});

	/**
	 * Fisher, not subtraction. 8.15% against 3% is exactly 5% because 1.05 × 1.03 = 1.0815, which makes
	 * this the one case where the right answer is a round number and a slip would be obvious.
	 */
	it('discounts the nominal return by inflation exactly', () => {
		expect(realRate(at(8.15, 3))).toBeCloseTo(5, 10);
		expect(realRate(at(7, 3))).toBeCloseTo(3.883495, 5);
	});

	// The shortcut always reads high, and over a long horizon the gap is worth several percent of balance.
	it('never agrees with nominal minus inflation once inflation is real', () => {
		for (const [nom, inf] of [
			[7, 3],
			[8, 3],
			[10, 3]
		] as const) {
			expect(realRate(at(nom, inf))).toBeLessThan(nom - inf);
		}
	});

	it('is the nominal figure itself when nothing is inflating', () => {
		expect(realRate(at(6, 0))).toBeCloseTo(6, 10);
	});

	// Inflation outrunning the return means the balance loses purchasing power, which must read negative
	// rather than clamp — the projection is allowed to shrink.
	it('goes negative when inflation outruns the return', () => {
		expect(realRate(at(2, 5))).toBeLessThan(0);
	});
});
