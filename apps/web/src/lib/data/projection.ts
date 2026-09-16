// Where the invested balance goes from here, under the assumptions you state. Two lines: one that keeps
// investing at the rate you have been, one that stops. The gap between them is what continuing to invest is
// worth.
//
// Two reference levels are drawn behind them, because they answer different questions:
//   FI number    spending / withdrawal rate — a pot that is never drawn down.
//   Lasts to N   the present value of spending from retirement to the horizon age — a pot that IS drawn
//                down, and so a smaller one. Its return funds the difference.
//
// Both rates come from `plannedRates`, the same reader the targets are built from, so a projection can
// never disagree with the FI number drawn beside it.

import type { DashboardData } from '$lib/data/types';
import type { MultiSeries, Scalar, Series } from './primitives';
import { MONEY, YEAR } from './primitives';
import { type Assumptions, assumptionsOf, realRate } from './assumptions';
import { fiNumber, investedBalance, plannedRates } from './networth';
import { series } from './series';
import { money } from '$lib/utils/format';
import { live, words } from '$lib/ui/label';

const INVESTING = 'Investing';
const COASTING = 'Coasting';

const TARGET = 'FI number';

const lastsToName = (a: Assumptions) => `Lasts to ${a.horizonAge}`;

/** Everything read AGAINST the investing line, so a caller can draw them all dotted. */
export function secondaryLines(a: Assumptions): string[] {
	return [COASTING, TARGET, lastsToName(a)];
}

/** The level a projection turns around at, `spending / r`. This, not the withdrawal rate against the
    return, decides whether a balance lasts: the withdrawal is a fixed sum, so a balance above this earns
    more than it pays out however high the stated rate is. */
export function breakEven(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): number | null {
	const r = realRate(a) / 100;
	if (r <= 0) return null;

	return plannedRates(data, a).spending / r;
}

/** The invested balance the coasting line reaches by the retirement year, for reading against
    `breakEven`. Null without a birth year to place that year. */
export function balanceAtRetirement(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): number | null {
	const path = pathFor(data, a);
	if (path === null || a.birthYear === null) return null;

	const at = path.years.indexOf(a.birthYear + a.retireAge);
	// Already past the retirement age: today's balance IS the balance it retires on.
	return at === -1 ? (path.coasting[0] ?? null) : (path.coasting[at] ?? null);
}

/**
 * The balance that funds `spend` a year from retirement to the horizon age and reaches zero exactly
 * there — the present value of an annuity, `spend × (1 − (1+r)^−n) / r`. Far smaller than `spend × n`,
 * because the balance keeps earning while it is drawn on. Null when the horizon is not past retirement.
 */
export function lastsToHorizon(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): number | null {
	const years = a.horizonAge - a.retireAge;
	if (years <= 0) return null;

	const spend = plannedRates(data, a).spending;
	const r = realRate(a) / 100;
	// A zero return earns nothing, and the formula divides by r; the balance is then just the total drawn.
	return r === 0 ? spend * years : spend * ((1 - (1 + r) ** -years) / r);
}

interface Path {
	years: number[];
	investing: number[];
	coasting: number[];
}

/**
 * Compound `start` forward a year at a time. Before the retirement year a line adds its contribution;
 * from that year on it withdraws trailing annual spending instead — real dollars, not a share of the
 * balance, because a percentage can never exhaust a portfolio and would make depletion unanswerable.
 *
 * Floored at zero: past that the balance is spent, and a line diving negative reads as a debt.
 */
function walk(start: number, a: Assumptions, contribution: number, spend: number): Path | null {
	if (a.birthYear === null) return null;

	const growth = 1 + realRate(a) / 100;
	const thisYear = new Date().getFullYear();
	const retireYear = a.birthYear + a.retireAge;
	const endYear = a.birthYear + a.horizonAge;
	if (endYear <= thisYear) return null;

	const years = [thisYear];
	const investing = [start];
	const coasting = [start];

	for (let year = thisYear + 1; year <= endYear; year++) {
		// A line that retires this year already lived through it, so the withdrawal starts the year after.
		const retired = year > retireYear;
		const step = (balance: number, adds: number) =>
			Math.max(0, balance * growth + (retired ? -spend : adds));

		years.push(year);
		investing.push(step(investing[investing.length - 1]!, contribution));
		coasting.push(step(coasting[coasting.length - 1]!, 0));
	}

	return { years, investing, coasting };
}

/** The path the projection draws, or null without a birth year or a snapshot to start from. */
function pathFor(data: DashboardData, a: Assumptions): Path | null {
	const start = investedBalance(data);
	if (start === null) return null;

	const rates = plannedRates(data, a);
	return walk(start, a, rates.investing, rates.spending);
}

/** The invested balance projected forward, with both targets drawn flat behind it. Investments rather
    than net worth: a withdrawal comes out of the invested pot, not the runway's liquid cash. */
export function investedProjection(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): MultiSeries {
	const unit = MONEY(data.currency);
	const path = pathFor(data, a);
	// An empty set rather than flat lines at zero: a chart draws that as "nothing to show".
	if (!path) return { kind: 'multiseries', unit, axis: 'ordinal', labels: [], series: [] };

	const labels = path.years.map(String);
	const line = (name: string, values: number[]): Series =>
		series(name, labels, values, unit, 'ordinal');
	const level = (name: string, at: number | null) =>
		at
			? [
					line(
						name,
						labels.map(() => at)
					)
				]
			: [];

	return {
		kind: 'multiseries',
		unit,
		axis: 'ordinal',
		labels,
		series: [
			line(INVESTING, path.investing),
			line(COASTING, path.coasting),
			...level(TARGET, fiNumber(data, a).value),
			...level(lastsToName(a), lastsToHorizon(data, a))
		]
	};
}

/** The first year the balance is spent, measured on the line that keeps investing — the plan actually
    being followed. Null where it never depletes. */
export function depletionYear(data: DashboardData, a: Assumptions = assumptionsOf(data)): Scalar {
	const path = pathFor(data, a);
	const spend = plannedRates(data, a).spending;
	const at = path?.investing.findIndex((balance) => balance <= 0) ?? -1;

	return {
		kind: 'scalar',
		unit: YEAR,
		label: words('Depletion year'),
		value: path && at !== -1 ? path.years[at]! : null,
		note: path && at !== -1 ? live(`at ${money(spend)}/yr`) : words('never at this rate')
	};
}
