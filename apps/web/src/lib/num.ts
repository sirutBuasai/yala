// Small numeric helpers shared across derivations.

/** Sum the numeric values of a record — e.g. a spent-by-category, deductions, or
 * contributions map. */
export function sumValues(m: Record<string, number>): number {
	return Object.values(m).reduce((a, b) => a + b, 0);
}
