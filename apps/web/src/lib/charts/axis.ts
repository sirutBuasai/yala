import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3-scale';
import { money, moneyK } from '$lib/utils/format';

/** A value→pixel mapping plus the ticks to label it with. Generic so a builder keeps its d3 surface. */
export interface ValueScale<S extends (v: number) => number = (v: number) => number> {
	y: S;
	ticks: number[];
}

/** What to draw at before the box is measured: a container reporting zero yields a degenerate viewBox. */
export const UNMEASURED = { w: 900, h: 300 };

/** A chart's margins: top, right, bottom, left. */
export interface Margins {
	t: number;
	r: number;
	b: number;
	l: number;
}

/**
 * The plot area inside a measured box, floored at zero on both axes. A pane can be shorter than a chart's
 * margins, and a negative height makes the browser reject the `<rect>` and inverts every d3 scale on it.
 */
export function plotSize(w: number, h: number, m: Margins): { iw: number; ih: number } {
	return { iw: Math.max(0, w - m.l - m.r), ih: Math.max(0, h - m.t - m.b) };
}

/**
 * Zero-anchored linear value→pixel Y scale, plus its ticks. `ih` is the inner plot height in px.
 *
 * `cap` fixes the top of the domain exactly, skipping the outward rounding: for a frame chosen on purpose
 * `.nice()` rounded the ceiling up and left a dead band above the clipped lines. Ticks still land on round
 * numbers below it; the top edge itself carries no label.
 */
export function moneyYScale(
	values: number[],
	ih: number,
	cap?: number
): ValueScale<ScaleLinear<number, number>> {
	const lo = Math.min(0, ...values);
	const y = scaleLinear()
		.domain([lo, cap ?? Math.max(0, ...values)])
		.range([ih, 0]);
	if (cap == null) y.nice();

	return { y, ticks: y.ticks(4).filter((t) => t <= y.domain()[1]!) };
}

/**
 * Linear Y scale for values that straddle zero. Headroom on each populated end but no outward rounding,
 * so zero sits where the data puts it — `moneyYScale`'s rounding inflates a small deficit into a band.
 */
export function signedYScale(
	values: number[],
	ih: number,
	pad = 0.08
): ValueScale<ScaleLinear<number, number>> {
	const lo = Math.min(0, ...values);
	const hi = Math.max(0, ...values);
	const span = hi - lo || 1;
	const y = scaleLinear()
		.domain([lo < 0 ? lo - span * pad : 0, hi > 0 ? hi + span * pad : 0])
		.range([ih, 0]);

	return { y, ticks: y.ticks(4) };
}

/**
 * Log10 value→pixel Y scale for series spanning orders of magnitude. The domain snaps outward to whole
 * decades; non-positive values can't be plotted and are dropped by the caller (`defined`).
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
 * How a money axis labels itself, chosen from the ticks it is about to draw rather than fixed per chart, so a
 * chart never has to know which scale it is drawing. Zero is exempt from the test and always exact: it sits on
 * almost every money axis, and requiring it to clear a thousand left every axis unabbreviated.
 */
export function moneyAxisFormat(ticks: number[]): (v: number) => string {
	const scaled = ticks.filter((t) => t !== 0);
	const abbreviate = scaled.length > 0 && scaled.every((t) => Math.abs(t) >= 1000);

	return (v) => (v === 0 ? money(0) : abbreviate ? moneyK(v) : money(v));
}

/**
 * Average glyph width as a fraction of font size. Approximate on purpose: measuring needs a canvas or a
 * layout pass, and erring small only means slightly smaller type, never a clipped label.
 */
const GLYPH_RATIO = 0.55;

/** The font size at which the longest of `labels` fits inside `gutter` px, clamped to stay legible: a
    label gutter shrinks its type rather than truncating. */
export function fitFontSize(gutter: number, labels: string[], min = 8, max = 12): number {
	const longest = Math.max(1, ...labels.map((l) => l.length));
	return Math.max(min, Math.min(max, gutter / (GLYPH_RATIO * longest)));
}

/** Width one character of axis type takes, near enough to budget with. */
const AXIS_GLYPH_W = 6.2;

/** Half the width `text` takes in axis type, which is how far a centred label reaches either side of the
    point it is centred on. */
export function halfLabelWidth(text: string): number {
	return (text.length * AXIS_GLYPH_W) / 2;
}

/**
 * How an x-label at `i` aligns to its point: centred, except at the ends, where it anchors inward to read
 * flush with the plot's edge. The last tick sits ON that edge and a chart's right margin is narrower than
 * half a label; `svg.chart` does not clip, so centred there it paints outside the card.
 */
export function labelAnchor(i: number, count: number): 'start' | 'middle' | 'end' {
	if (count <= 1) return 'middle';
	if (i === 0) return 'start';
	return i === count - 1 ? 'end' : 'middle';
}

/**
 * Which x-label indices to draw: budget each the width of the longest, keep every nth, and always keep
 * the last. Its neighbour is dropped when the two would overlap.
 */
export function labelIndices(count: number, innerWidth: number, labels: string[]): number[] {
	if (count <= 1) return count === 1 ? [0] : [];

	const room = Math.max(...labels.map((l) => l.length), 1) * AXIS_GLYPH_W + 12;
	const fits = Math.max(2, Math.min(12, Math.floor(innerWidth / room)));
	const stride = Math.max(1, Math.ceil(count / fits));

	const out: number[] = [];
	for (let i = 0; i < count - 1; i += stride) out.push(i);

	// The last tick is always drawn, so it is the one the stride cannot place. Drop the label before it when
	// the two would not both fit — measured in PIXELS, not as a fraction of the stride, which let a gap of
	// most of a stride still overlap on a long axis.
	const last = count - 1;
	const prev = out[out.length - 1];
	if (prev !== undefined && ((last - prev) * innerWidth) / last < room) out.pop();
	out.push(last);

	return out;
}
