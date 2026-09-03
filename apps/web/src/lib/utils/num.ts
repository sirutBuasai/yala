// Small numeric helpers shared across derivations.

export function sumValues(m: Record<string, number>): number {
	return Object.values(m).reduce((a, b) => a + b, 0);
}

/** Confine `v` to [min, max] — the JS counterpart of CSS clamp(), for measured chart geometry. */
export function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}
