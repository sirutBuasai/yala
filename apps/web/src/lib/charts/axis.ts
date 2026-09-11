import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3-scale';

/**
 * A value→pixel mapping plus the ticks to label it with. Generic in the scale so each builder keeps its
 * full d3 surface while callers that only plot can accept either.
 */
export interface ValueScale<S extends (v: number) => number = (v: number) => number> {
	y: S;
	ticks: number[];
}

/** What to draw at before the box has been measured, which only keeps a container measuring zero from
    producing a degenerate viewBox. One value, so no two charts appear to disagree about the box. */
export const UNMEASURED = { w: 900, h: 300 };

/** A chart's margins: top, right, bottom, left. */
export interface Margins {
	t: number;
	r: number;
	b: number;
	l: number;
}

/**
 * The plot area inside a measured box, floored at zero on both axes. The box is the shared
 * `.figurebox` at its measured pixel size (see app.css), which also bounds how tall a chart may grow
 * inside a stretched pane.
 *
 * The floor is the point: a pane can be made shorter than a chart's own margins, and a negative height
 * makes the browser reject the `<rect>` outright and inverts every d3 scale built on that range, so the
 * chart draws upside down.
 */
export function plotSize(w: number, h: number, m: Margins): { iw: number; ih: number } {
	return { iw: Math.max(0, w - m.l - m.r), ih: Math.max(0, h - m.t - m.b) };
}

/** Zero-anchored linear value→pixel Y scale, plus its ticks. `ih` is the inner plot height in px. */
export function moneyYScale(values: number[], ih: number): ValueScale<ScaleLinear<number, number>> {
	const y = scaleLinear()
		.domain([Math.min(0, ...values), Math.max(0, ...values)])
		.nice()
		.range([ih, 0]);

	return { y, ticks: y.ticks(4) };
}

/**
 * Log10 value→pixel Y scale for series spanning orders of magnitude, which a linear scale crushes
 * against the axis. Domain snaps outward to whole decades so gridlines land on round numbers;
 * non-positive values can't be plotted on a log axis and are dropped by the caller (`defined`).
 */
export function logYScale(
	values: number[],
	ih: number
): ValueScale<ScaleLogarithmic<number, number>> {
	const pos = values.filter((v) => v > 0);
	const lo = pos.length ? 10 ** Math.floor(Math.log10(Math.min(...pos))) : 1;
	const hi = pos.length ? 10 ** Math.ceil(Math.log10(Math.max(...pos))) : 10;
	const y = scaleLog().domain([lo, hi]).range([ih, 0]);

	// Decade ticks, subdivided when the span is narrow enough to need them.
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
 * Average glyph width as a fraction of font size, for the app's sans at chart sizes. Approximate on
 * purpose: measuring properly needs a canvas or a layout pass, and erring small only ever means
 * slightly smaller type, never a clipped label.
 */
const GLYPH_RATIO = 0.55;

/** The font size at which the longest of `labels` fits inside `gutter` px, clamped to stay legible: a
    label gutter shrinks its type rather than truncating. */
export function fitFontSize(gutter: number, labels: string[], min = 8, max = 12): number {
	const longest = Math.max(1, ...labels.map((l) => l.length));
	return Math.max(min, Math.min(max, gutter / (GLYPH_RATIO * longest)));
}

/**
 * Which x-label indices to draw, given how much room there is: budget each label the width of the
 * longest one, keep every nth, and always keep the last — the one readers look for. The neighbour
 * before the last is dropped when the two would otherwise overlap, which they did on screen.
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
	if (prev !== undefined && last - prev < stride * 0.5) out.pop();
	out.push(last);

	return out;
}
