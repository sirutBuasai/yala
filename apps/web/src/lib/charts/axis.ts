import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3-scale';

/**
 * A value→pixel mapping plus the ticks to label it with. Generic in the scale so each builder
 * keeps its full d3 surface (`.domain()` etc.) while callers that only plot can accept either.
 */
export interface ValueScale<S extends (v: number) => number = (v: number) => number> {
	y: S;
	ticks: number[];
}

/**
 * Zero-anchored linear value→pixel Y scale, plus its tick values. Shared by the bar and
 * line charts so they all include zero, `nice()`-round the domain, and tick identically.
 * `ih` is the inner (plot) height in pixels; the scale maps the max value to y=0 (top).
 */
export function moneyYScale(values: number[], ih: number): ValueScale<ScaleLinear<number, number>> {
	const y = scaleLinear()
		.domain([Math.min(0, ...values), Math.max(0, ...values)])
		.nice()
		.range([ih, 0]);

	return { y, ticks: y.ticks(4) };
}

/**
 * Log10 value→pixel Y scale for series whose magnitudes span orders of magnitude — the
 * category-by-year lines, where the largest category is ~20× the smallest and a linear
 * scale crushes everything below the top one or two. Domain snaps outward to whole decades
 * so gridlines land on round numbers; non-positive values can't be plotted on a log axis
 * and are dropped by the caller (`defined`).
 */
export function logYScale(
	values: number[],
	ih: number
): ValueScale<ScaleLogarithmic<number, number>> {
	const pos = values.filter((v) => v > 0);
	const lo = pos.length ? 10 ** Math.floor(Math.log10(Math.min(...pos))) : 1;
	const hi = pos.length ? 10 ** Math.ceil(Math.log10(Math.max(...pos))) : 10;
	const y = scaleLog().domain([lo, hi]).range([ih, 0]);

	// Decade ticks, plus 2× / 5× subdivisions when the span is narrow enough to need them.
	const decades = Math.log10(hi) - Math.log10(lo);
	const ticks: number[] = [];
	for (let d = Math.log10(lo); d <= Math.log10(hi) + 1e-9; d++) {
		const base = 10 ** d;
		ticks.push(base);
		if (decades <= 3 && base * 2 < hi) ticks.push(base * 2);
		if (decades <= 3 && base * 5 < hi) ticks.push(base * 5);
	}

	return { y, ticks: ticks.sort((a, b) => a - b) };
}
