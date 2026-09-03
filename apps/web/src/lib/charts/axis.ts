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

/**
 * Average glyph width as a fraction of font size, for the app's sans at chart sizes. Measuring
 * text properly needs a canvas or a layout pass; this approximation is what lets label fitting be
 * a pure function, which is worth more here than exactness — being a few percent conservative
 * only ever means slightly smaller type, never a clipped label.
 */
const GLYPH_RATIO = 0.55;

/**
 * The font size at which the longest of `labels` fits inside `gutter` pixels, clamped to a
 * readable range. Shared by the charts with a fixed label gutter (the ranked bars' row names, the
 * heatmap's category column), which each need the same answer: shrink rather than truncate, but
 * never shrink past legibility.
 */
export function fitFontSize(gutter: number, labels: string[], min = 8, max = 12): number {
	const longest = Math.max(1, ...labels.map((l) => l.length));
	return Math.max(min, Math.min(max, gutter / (GLYPH_RATIO * longest)));
}

/**
 * Which x-label indices to draw, given how much room there is.
 *
 * Thinning by count alone crams a narrow pane; thinning without protecting the final label loses
 * the series' end date, which is the one readers look for. So: budget each label the width of the
 * longest one, keep every nth, always keep the last — and drop the neighbour before it when the two
 * would sit on top of each other, which is what made "2026-02-01" and "2026-08-26" overlap.
 */
export function labelIndices(count: number, innerWidth: number, labels: string[]): number[] {
	if (count <= 1) return count === 1 ? [0] : [];

	const room = Math.max(...labels.map((l) => l.length), 1) * 6.2 + 12;
	const fits = Math.max(2, Math.min(12, Math.floor(innerWidth / room)));
	const stride = Math.max(1, Math.ceil(count / fits));

	const out: number[] = [];
	for (let i = 0; i < count - 1; i += stride) out.push(i);

	const last = count - 1;
	const prev = out[out.length - 1];
	// Half a stride is the crowding threshold: closer than that and the two labels touch.
	if (prev !== undefined && last - prev < stride * 0.5) out.pop();
	out.push(last);

	return out;
}
