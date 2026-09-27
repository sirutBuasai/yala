// Where the invested balance goes from here: one line that keeps investing at the rate you have been, one
// that stops, against two reference levels. Rates come from `plannedRates`, so a projection cannot disagree
// with the FI number drawn beside it.

import type { DashboardData } from '$lib/data/types';
import type { MultiSeries, Scalar, Series } from './primitives';
import { MONEY, YEAR, scalar } from './primitives';
import { type Assumptions, assumptionsOf, realRate } from './assumptions';
import { fiNumber, investedBalance, NEEDS_BIRTH_YEAR, plannedRates } from './networth';
import { multiseries, series } from './series';
import { money, moneyCompact } from '$lib/utils/format';
import { live, words, type Label } from '$lib/ui/label';

const INVESTING = 'Investing';
const COASTING = 'Coasting';

const TARGET = 'FI number';
const BAND = 'Middle 80% of markets';

/** Simulated markets a risk reading runs. */
const RUNS = 1000;
/** The share of runs below the band, and above it. */
const TAIL = 0.1;

const lastsToName = (a: Assumptions) => `Lasts to ${a.horizonAge}`;

/** Everything read AGAINST the investing line, so a caller can draw them all dotted. */
export function secondaryLines(a: Assumptions): string[] {
	return [COASTING, TARGET, lastsToName(a)];
}

/** The level a projection turns around at, `spending / r`. This, not the withdrawal rate against the
    return, decides whether a balance lasts: the withdrawal is a fixed sum, so anything above this earns
    more than it pays out. */
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
 * The balance that funds `spend` a year from retirement to the horizon age and reaches zero exactly there:
 * the present value of an annuity, `spend × (1 − (1+r)^−n) / r`. Far smaller than `spend × n`, since the
 * balance keeps earning while it is drawn on. Null when the horizon is not past retirement.
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
 * Compound `start` forward a year at a time. Before the retirement year a line adds its contribution; from
 * then on it withdraws trailing annual spending — real dollars, not a share of the balance, since a
 * percentage can never exhaust a portfolio and would make depletion unanswerable.
 *
 * Floored at zero: past that the balance is spent, and a line diving negative reads as a debt.
 *
 * `returnIn` is the real return of the nth year out, in percent: the expected one unless a market is
 * being simulated.
 */
function walk(
	start: number,
	a: Assumptions,
	contribution: number,
	spend: number,
	returnIn: (n: number) => number = () => realRate(a)
): Path | null {
	if (a.birthYear === null) return null;

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
		const growth = 1 + returnIn(year - thisYear) / 100;
		const step = (balance: number, adds: number) =>
			Math.max(0, balance * growth + (retired ? -spend : adds));

		years.push(year);
		investing.push(step(investing[investing.length - 1]!, contribution));
		coasting.push(step(coasting[coasting.length - 1]!, 0));
	}

	return { years, investing, coasting };
}

/** The path the projection draws, or null without a birth year or a snapshot to start from. */
function pathFor(
	data: DashboardData,
	a: Assumptions,
	returnIn?: (n: number) => number
): Path | null {
	const start = investedBalance(data);
	if (start === null) return null;

	const rates = plannedRates(data, a);
	return walk(start, a, rates.investing, rates.spending, returnIn);
}

/** A seeded generator, so the band holds still between renders and moves only with an assumption. */
function seeded(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/** A standard normal draw (Box-Muller). */
function gaussian(next: () => number): number {
	return (
		Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, next()))) * Math.cos(2 * Math.PI * next())
	);
}

export interface MarketRisk {
	/** The investing line's balance each year, at the bottom and top of the middle 80% of markets. */
	lo: number[];
	hi: number[];
	/** Share of markets still funded at the horizon age, in percent. */
	lasting: number;
	/** The year the worst tenth of markets runs out, or null where even they last. */
	worstRunsOut: number | null;
}

/**
 * The investing line re-run in `RUNS` markets, each year's real return drawn around the expected one at
 * the stated volatility. Null without a path to run, or with no volatility to spread it.
 */
export function marketRisk(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data)
): MarketRisk | null {
	if (!a.volatility) return null;

	const next = seeded(RUNS);
	const expected = realRate(a);
	const runs: number[][] = [];
	for (let i = 0; i < RUNS; i++) {
		const path = pathFor(data, a, () => expected + a.volatility * gaussian(next));
		if (!path) return null;
		runs.push(path.investing);
	}

	const years = runs[0]!.length;
	const at = (q: number) =>
		Array.from({ length: years }, (_, y) => {
			const sorted = runs.map((run) => run[y]!).sort((m, n) => m - n);
			return sorted[Math.floor(q * (RUNS - 1))]!;
		});
	const lo = at(TAIL);
	const out = lo.findIndex((balance) => balance <= 0);
	return {
		lo,
		hi: at(1 - TAIL),
		lasting: (runs.filter((run) => run.at(-1)! > 0).length / RUNS) * 100,
		worstRunsOut: out === -1 ? null : new Date().getFullYear() + out
	};
}

/** What `marketRisk` found, as the line under the projection. */
export function riskSummary(risk: MarketRisk, a: Assumptions): Label {
	const worst =
		risk.worstRunsOut === null
			? 'Even the worst tenth lasts.'
			: `In the worst tenth, the balance runs out by ${risk.worstRunsOut}.`;
	return live(
		`${Math.round(risk.lasting)}% of ${RUNS.toLocaleString()} simulated markets last to ${a.horizonAge}. ${worst}`
	);
}

/** The year the investing line first reaches the FI number, with the age you are then. */
export function fiDate(data: DashboardData, a: Assumptions = assumptionsOf(data)): Scalar {
	const label = words('FI date');
	const path = pathFor(data, a);
	const target = fiNumber(data, a).value;
	if (!path || !target || a.birthYear === null) {
		return scalar(YEAR, label, null, {
			note: a.birthYear === null ? NEEDS_BIRTH_YEAR : undefined
		});
	}

	const year = firstYear(path, (balance) => balance >= target);
	if (year === null) {
		return scalar(YEAR, label, null, {
			note: live(`not reached by ${a.horizonAge} at this rate`)
		});
	}

	return scalar(YEAR, label, year, {
		note: live(
			year === path.years[0]
				? `investing is already past the ${moneyCompact(target)} FI number`
				: `at ${year - a.birthYear}, when investing reaches the ${moneyCompact(target)} FI number`
		)
	});
}

/** The first year the investing line meets `reached`, or null where it never does. */
function firstYear(path: Path, reached: (balance: number, year: number) => boolean): number | null {
	const at = path.investing.findIndex((balance, i) => reached(balance, path.years[i]!));
	return at === -1 ? null : path.years[at]!;
}

/** One point on the plan's timeline: every milestone that falls in its year. */
export interface Milestone {
	names: string[];
	year: number;
	/** In or before this year. */
	reached: boolean;
	/** The investing line's balance that year. */
	balance: number;
}

/** A stretch of the plan between two milestones, named for what it is. */
export interface Phase {
	name: string;
	from: number;
	to: number;
}

/** Everything the timeline pane reads: the milestones, the phases between them, and a few counts. */
export interface Plan {
	milestones: Milestone[];
	phases: Phase[];
	/** Years from now, or null where it never comes. */
	toFi: number | null;
	toRetire: number;
	/** The investing line's balance at the retirement year. */
	atRetirement: number;
	/** The smallest monthly changes that bring FI a year sooner, or within reach at all: spending less, or
	    investing more. Each null already at FI, or where no change in reach gets there. */
	levers: { spend: Lever | null; invest: Lever | null };
}

/** A monthly change to one figure of the plan, and the year FI then comes. */
export interface Lever {
	monthly: number;
	year: number;
}

/** The monthly steps a lever searches in, and how far: round figures a person can act on. */
const LEVER_STEP = 50;
const LEVER_STEPS = 100;

/**
 * The plan's timeline from this year to the horizon: today; Coast FI, the first year the investing line,
 * left alone from then, compounds into the FI number by retirement; FI; retirement; the horizon. Milestones
 * in one year share an entry. The phases between them: building to Coast FI, optional coast to FI,
 * optional work to retirement, drawing down after; a milestone already passed, or never reached before
 * retiring, drops the phase it would start. Null without a path.
 */
export function plan(data: DashboardData, a: Assumptions = assumptionsOf(data)): Plan | null {
	const path = pathFor(data, a);
	const target = fiNumber(data, a).value;
	if (!path || !target || a.birthYear === null) return null;

	const now = path.years[0]!;
	const end = path.years.at(-1)!;
	const retire = a.birthYear + a.retireAge;
	const growth = 1 + realRate(a) / 100;
	const coast = firstYear(path, (b, year) => b >= target / growth ** Math.max(0, retire - year));
	const fi = firstYear(path, (b) => b >= target);
	const balanceIn = (year: number) =>
		path.investing[Math.min(path.years.length - 1, Math.max(0, year - now))]!;

	const milestones: Milestone[] = [];
	for (const [name, year] of [
		['Today', now],
		['Coast FI', coast],
		['FI', fi],
		['Retire', retire],
		[`Age ${a.horizonAge}`, end]
	] as [string, number | null][]) {
		// A milestone already behind, a retirement years ago, is not on a timeline that starts today.
		if (year === null || year < now) continue;
		const same = milestones.find((m) => m.year === year);
		if (same) same.names.push(name);
		else milestones.push({ names: [name], year, reached: year <= now, balance: balanceIn(year) });
	}
	milestones.sort((p, q) => p.year - q.year);

	// Each phase starts at its milestone and runs to the next one that starts a phase.
	const before = (year: number | null) => (year !== null && year < retire ? year : null);
	const starts = (
		[
			['Building', now],
			['Optional coast', before(coast)],
			['Optional work', before(fi)],
			['Drawing down', retire]
		] as [string, number | null][]
	)
		.filter((s): s is [string, number] => s[1] !== null)
		.map(([name, year]) => ({ name, from: Math.max(now, year) }));
	const phases = starts
		.map((p, i) => ({ ...p, to: starts[i + 1]?.from ?? end }))
		.filter((p) => p.to > p.from);

	return {
		milestones,
		phases,
		toFi: fi === null ? null : fi - now,
		toRetire: Math.max(0, retire - now),
		atRetirement: balanceIn(retire),
		levers:
			fi === now
				? { spend: null, invest: null }
				: {
						spend: lever(data, fi, (yearly) => {
							const spending = plannedRates(data, a).spending - yearly;
							return spending > 0 ? { ...a, plannedSpending: spending } : null;
						}),
						invest: lever(data, fi, (yearly) => ({
							...a,
							outOfPocket: (a.outOfPocket ?? plannedRates(data, a).residual) + yearly
						}))
					}
	};
}

/**
 * The smallest monthly change, in `LEVER_STEP`s, whose plan (`changed`, handed the change a year; null
 * where it no longer makes sense) reaches FI before `fi`, or at all where `fi` is null. Each lever moves one
 * figure alone: spending less lowers the FI number, investing more grows the balance.
 */
function lever(
	data: DashboardData,
	fi: number | null,
	changed: (yearly: number) => Assumptions | null
): Lever | null {
	for (let step = 1; step <= LEVER_STEPS; step++) {
		const monthly = step * LEVER_STEP;
		const a = changed(monthly * 12);
		if (!a) return null;
		const year = fiDate(data, a).value;
		if (year !== null && (fi === null || year < fi)) return { monthly, year };
	}
	return null;
}

/** The invested balance projected forward, both targets drawn flat behind it. Investments rather than net
    worth: a withdrawal comes out of the invested pot, not the runway's liquid cash. */
export function investedProjection(
	data: DashboardData,
	a: Assumptions = assumptionsOf(data),
	risk: MarketRisk | null = marketRisk(data, a)
): MultiSeries {
	const unit = MONEY(data.currency);
	const path = pathFor(data, a);
	// An empty set rather than flat lines at zero: a chart draws that as "nothing to show".
	if (!path) return multiseries(unit, 'ordinal', [], []);

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
		...multiseries(unit, 'ordinal', labels, [
			line(INVESTING, path.investing),
			line(COASTING, path.coasting),
			...level(TARGET, fiNumber(data, a).value),
			...level(lastsToName(a), lastsToHorizon(data, a))
		]),
		// `pathFor` returned a path, so the birth year is set.
		notes: path.years.map((year) => `age ${year - a.birthYear!}`),
		band: risk ? { name: BAND, of: INVESTING, lo: risk.lo, hi: risk.hi } : undefined
	};
}

/** The first year the balance is spent, on the line that keeps investing — the plan actually being
    followed. Null where it never depletes. */
export function depletionYear(data: DashboardData, a: Assumptions = assumptionsOf(data)): Scalar {
	const path = pathFor(data, a);
	const spend = plannedRates(data, a).spending;
	const at = path?.investing.findIndex((balance) => balance <= 0) ?? -1;

	return scalar(YEAR, words('Depletion year'), path && at !== -1 ? path.years[at]! : null, {
		note: path && at !== -1 ? live(`at ${money(spend)}/yr`) : words('never at this rate')
	});
}
