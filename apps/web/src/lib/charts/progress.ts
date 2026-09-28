// The track's end IS the target, so tracks in different units still compare. Never scaled to the value,
// which drew an overshoot and a near-miss as the same bar.

import { formatUnit, formatUnitCompact, type BulletRow, type Unit } from '$lib/data/primitives';

/** How far along its target a figure sits, or null where there is nothing to draw. */
export interface Fill {
	/** Percent of the track, held to it. */
	pct: number;
	/** Percent of the target, not held: a ring prints it past 100. */
	share: number;
	/** Past the target, which the track cannot show by growing. */
	over: boolean;
	reached: boolean;
}

export function fillTo(value: number | null | undefined, target: number): Fill | null {
	if (value == null || !target) return null;

	const share = (value / target) * 100;
	return {
		pct: Math.min(100, Math.max(0, share)),
		share,
		over: share > 100,
		reached: share >= 100
	};
}

/** What a screen reader reads in place of the bare number, since a track states neither the figure it has
    reached nor the target it is judged against. */
export function fillText(value: number | null, target: number, unit: Unit): string {
	return value == null
		? 'not available'
		: `${formatUnit(value, unit)} of ${formatUnit(target, unit)}`;
}

/** The amounts behind a share, compact, as `value / target`. */
export function amountText({ value, target, unit }: NonNullable<BulletRow['amount']>): string {
	return `${formatUnitCompact(value, unit)} / ${formatUnitCompact(target, unit)}`;
}
