// Small numeric helpers shared across derivations.

export function sumValues(m: Record<string, number>): number {
	return Object.values(m).reduce((a, b) => a + b, 0);
}
