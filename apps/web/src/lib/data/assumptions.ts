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
	/** How far a year's return strays from the expected one (a standard deviation), as a percentage. */
	volatility: number;
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
	volatility: 15,
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
		volatility: s.volatility ?? FALLBACK.volatility,
		retireAge: s.retire_age ?? FALLBACK.retireAge,
		runwayTarget: s.runway_target ?? FALLBACK.runwayTarget,
		horizonAge: s.horizon_age ?? FALLBACK.horizonAge,
		birthYear: s.birth_year ?? null,
		plannedSpending: s.planned_spending ?? null,
		outOfPocket: s.out_of_pocket ?? null
	};
}

/** The real rate every projection compounds at, as a percentage. Fisher's relation, NOT `nominal -
    inflation`: the shortcut overstates the rate, which compounds to a badly wrong balance over a lifetime
    horizon. */
export function realRate(a: Assumptions): number {
	return ((1 + a.nominalReturn / 100) / (1 + a.inflation / 100) - 1) * 100;
}

/** A setting's field in `data.settings`. The ledger's key is hyphenated, which is not a legal field name,
    so the contract spells it with underscores. */
export function settingField(settingKey: string): string {
	return settingKey.replaceAll('-', '_');
}

/** `data` as if the ledger stated `values` (keyed as the ledger keys them), so every figure built from it
    previews them. A null is a setting left at what the ledger states. */
export function withSettings(
	data: DashboardData,
	values: Record<string, number | null>
): DashboardData {
	const stated = Object.entries(values).filter(([, v]) => v != null);
	if (!stated.length || !data.settings) return data;

	const overrides = Object.fromEntries(stated.map(([key, v]) => [settingField(key), v]));
	return { ...data, settings: { ...data.settings, ...overrides } };
}

/** Years until the retirement age stated, or null without a birth year to count from. */
export function yearsToRetirement(a: Assumptions): number | null {
	if (a.birthYear === null) return null;

	const age = new Date().getFullYear() - a.birthYear;
	return Math.max(0, a.retireAge - age);
}
