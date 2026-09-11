/** Total of one field over a list — the shape every tally in the app takes. */
export function sumBy<T>(items: readonly T[], value: (item: T) => number): number {
	return items.reduce((total, item) => total + value(item), 0);
}

export function sum(numbers: readonly number[]): number {
	return sumBy(numbers, (n) => n);
}

export function sumValues(m: Record<string, number>): number {
	return sum(Object.values(m));
}

export function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}
