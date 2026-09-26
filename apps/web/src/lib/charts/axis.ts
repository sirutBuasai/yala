import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3-scale';
import { money, moneyK } from '$lib/utils/format';
import { inPeriod } from '$lib/utils/period';

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
 * `.nice()` rounded the ceiling up and left a dead band above the clipped lines.
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

/** Linear Y scale for values straddling zero: headroom on each populated end but no outward rounding, so
    zero sits where the data puts it. `moneyYScale`'s rounding inflates a small deficit into a band. */
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

/** Log10 Y scale for series spanning orders of magnitude. The domain snaps outward to whole decades;
    non-positive values can't be plotted and are dropped by the caller. */
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
 * chart never has to know which scale it is on. Zero is exempt and always exact: it sits on almost every money
 * axis, and requiring it to clear a thousand left every axis unabbreviated.
 */
export function moneyAxisFormat(ticks: number[]): (v: number) => string {
	const scaled = ticks.filter((t) => t !== 0);
	const abbreviate = scaled.length > 0 && scaled.every((t) => Math.abs(t) >= 1000);

	return (v) => (v === 0 ? money(0) : abbreviate ? moneyK(v) : money(v));
}

/** Width one character of axis type takes, near enough to budget with. */
const AXIS_GLYPH_W = 6.2;

/** Half the width `text` takes in axis type, which is how far a centred label reaches either side of the
    point it is centred on. */
export function halfLabelWidth(text: string): number {
	return (text.length * AXIS_GLYPH_W) / 2;
}

/**
 * How an x-label at `i` aligns to its point: centred, except at the ends, where it anchors inward. The last
 * tick sits ON the plot's edge and a chart's right margin is narrower than half a label; `svg.chart` does not
 * clip, so centred there it paints outside the card.
 */
export function labelAnchor(i: number, count: number): 'start' | 'middle' | 'end' {
	if (count <= 1) return 'middle';
	if (i === 0) return 'start';
	return i === count - 1 ? 'end' : 'middle';
}

/** Height of a line of axis type, near enough to budget with. */
const AXIS_LINE_H = 11;
/** Room a label leaves below the plot when it lies flat. */
const FLAT_BOTTOM = 28;

export interface XLabelLayout {
	/** Degrees the labels turn upward from flat: 0, 45 or 90. */
	angle: 0 | 45 | 90;
	/** Room the labels take below the plot, in px: a chart's bottom margin. */
	bottom: number;
}

/**
 * How to draw every x-label at `xs` without any two overlapping: flat where they fit, else turned 45
 * degrees, else upright, with the room below the plot grown to hold them. `anchored` is for a continuous
 * axis, whose end labels anchor inward (`labelAnchor`) and so reach a whole width into the plot.
 */
export function xLabelLayout(xs: number[], labels: string[], anchored: boolean): XLabelLayout {
	const width = Math.max(1, ...labels.map((l) => l.length)) * AXIS_GLYPH_W + 8;
	const count = xs.length;
	const reach = (i: number): [number, number] => {
		const x = xs[i]!;
		const anchor = anchored ? labelAnchor(i, count) : 'middle';
		if (anchor === 'start') return [x, x + width];
		if (anchor === 'end') return [x - width, x];
		return [x - width / 2, x + width / 2];
	};
	const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
	const flat = xs.slice(1).every((_, i) => reach(i)[1] <= reach(i + 1)[0]);
	if (flat) return { angle: 0, bottom: FLAT_BOTTOM };

	const angle = Math.min(...gaps) >= AXIS_LINE_H * Math.SQRT2 ? 45 : 90;
	const rise = angle === 45 ? width * Math.SQRT1_2 : width;
	return { angle, bottom: Math.ceil(rise) + 12 };
}

/** How wide a focus band reaches around a lone point on a continuous axis of `count` points. */
export function focusPad(count: number, innerWidth: number): number {
	return Math.min(48, count > 1 ? (innerWidth / (count - 1)) * 0.6 : 24);
}

/**
 * The positions `mark` names along an axis: those whose period falls within it, or, on an axis without
 * periods, the one it labels.
 */
export function markedIndices(
	labels: string[],
	periods: string[] | undefined,
	mark?: string
): number[] {
	if (mark == null) return [];
	return labels.flatMap((label, i) => {
		const period = periods?.[i];
		return (period != null ? inPeriod(period, mark) : label === mark) ? [i] : [];
	});
}
