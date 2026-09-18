// The figures the ledger can't derive, as one object. Read through here rather than off `data.settings`,
// which is what lets a preview be drawn against values not written yet.

import type { DashboardData } from '$lib/data/types';

export interface Assumptions {
	/** Withdrawal rate at retirement, as a percentage. */
	swr: number;
	/** Expected annual investment return before inflation, as a percentage. */
	nominalReturn: number;
	/** Long-run inflation the return is discounted by, as a percentage. */
	inflation: number;
	retireAge: number;
	/** Months of spending to hold liquid. */
	runwayTarget: number;
	/** The age the projection runs to, and so the age the balance has to last until. */
	horizonAge: number;
	/** Null means unset. Everything counted from it stays null rather than guessing an age. */
	birthYear: number | null;
	/** Yearly spending to plan against. Null falls back to what the ledger logged. */
	plannedSpending: number | null;
	/** Yearly investing beyond payroll contributions, which are always invested and so excluded here. Not
	    held to what is left after spending. Null falls back to the ledger's leftover. */
	outOfPocket: number | null;
}

/** Mirrors the backend spec defaults, for a snapshot taken before a setting existed. */
const FALLBACK: Assumptions = {
	swr: 4,
	nominalReturn: 8,
	inflation: 3,
	retireAge: 60,
	runwayTarget: 6,
	horizonAge: 95,
	birthYear: null,
	plannedSpending: null,
	outOfPocket: null
};

/** What the ledger currently states, each figure falling back to its default. */
export function assumptionsOf(data: DashboardData): Assumptions {
	const s = data.settings;
	if (!s) return FALLBACK;

	return {
		swr: s.swr ?? FALLBACK.swr,
		nominalReturn: s.nominal_return ?? FALLBACK.nominalReturn,
		inflation: s.inflation ?? FALLBACK.inflation,
		retireAge: s.retire_age ?? FALLBACK.retireAge,
		runwayTarget: s.runway_target ?? FALLBACK.runwayTarget,
		horizonAge: s.horizon_age ?? FALLBACK.horizonAge,
		birthYear: s.birth_year ?? null,
		plannedSpending: s.planned_spending ?? null,
		outOfPocket: s.out_of_pocket ?? null
	};
}

/**
 * The rate every projection compounds at: the nominal return discounted by inflation, so a balance and the
 * spending it funds are both in today's purchasing power. A percentage.
 *
 * The Fisher relation, `(1+real) = (1+nominal)/(1+inflation)`, NOT `nominal - inflation`: the shortcut
 * overstates the real rate, which compounds to a badly wrong balance over a lifetime horizon.
 */
export function realRate(a: Assumptions): number {
	return ((1 + a.nominalReturn / 100) / (1 + a.inflation / 100) - 1) * 100;
}

/** The assumption a setting feeds, for a form holding its values by the ledger's key. Derived rather than
    mapped: the two spellings differ only in casing, so a table of them would fall out of step. */
export function assumptionKey(settingKey: string): keyof Assumptions {
	return settingKey.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) as keyof Assumptions;
}

/** Years until the retirement age stated, or null without a birth year to count from. */
export function yearsToRetirement(a: Assumptions): number | null {
	if (a.birthYear === null) return null;

	const age = new Date().getFullYear() - a.birthYear;
	return Math.max(0, a.retireAge - age);
}
