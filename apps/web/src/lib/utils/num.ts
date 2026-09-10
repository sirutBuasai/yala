export function sumValues(m: Record<string, number>): number {
	return Object.values(m).reduce((a, b) => a + b, 0);
}

export function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}
