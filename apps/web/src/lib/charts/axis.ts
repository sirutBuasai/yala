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

/** Floored at zero: a negative height makes the browser reject the `<rect>` and inverts every d3 scale. */
export function plotSize(w: number, h: number, m: Margins): { iw: number; ih: number } {
	return { iw: Math.max(0, w - m.l - m.r), ih: Math.max(0, h - m.t - m.b) };
}

/** Zero-anchored Y scale over `ih` px, plus its ticks. `cap` fixes the domain's top exactly, since `.nice()`
    rounded a chosen ceiling up and left a dead band above the clipped lines. */
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

/** Chosen from the ticks about to be drawn, so a chart never needs to know its scale. Zero is always exact,
    or no axis would ever abbreviate. */
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

/** Centred, except at the ends, where it anchors inward: `svg.chart` does not clip, so a centred end label
    paints outside the card. */
export function labelAnchor(i: number, count: number): 'start' | 'middle' | 'end' {
	if (count <= 1) return 'middle';
	if (i === 0) return 'start';
	return i === count - 1 ? 'end' : 'middle';
}

/** Height of a line of axis type, near enough to budget with. */
const AXIS_LINE_H = 11;
/** Room a label leaves below the plot when it lies flat. */
const FLAT_BOTTOM = 28;

const labelWidth = (text: string) => text.length * AXIS_GLYPH_W + 8;

/** One label under a plot: where it sits, how it anchors there, and which points it names. */
export interface AxisTick {
	x: number;
	text: string;
	anchor: 'start' | 'middle' | 'end';
	points: number[];
}

export interface XAxis {
	ticks: AxisTick[];
	/** Degrees the labels turn upward from flat: 0, 45 or 90. */
	angle: 0 | 45 | 90;
	/** Room the labels take below the plot, in px: a chart's bottom margin. */
	bottom: number;
}

function reach(t: AxisTick): [number, number] {
	const w = labelWidth(t.text);
	if (t.anchor === 'start') return [t.x, t.x + w];
	if (t.anchor === 'end') return [t.x - w, t.x];
	return [t.x - w / 2, t.x + w / 2];
}

const clear = (ticks: AxisTick[]) =>
	ticks.slice(1).every((t, i) => reach(ticks[i]!)[1] <= reach(t)[0]);

/** One tick per year of `periods`, centred on the span of that year's points. A year whose label would
    reach past either end of the plot, or into the year before, is left unlabelled. */
function yearTicks(xs: number[], periods: string[]): AxisTick[] {
	const groups = new Map<string, number[]>();
	periods.forEach((p, i) => groups.set(p.slice(0, 4), [...(groups.get(p.slice(0, 4)) ?? []), i]));
	const [lo, hi] = [xs[0] ?? 0, xs.at(-1) ?? 0];
	const out: AxisTick[] = [];
	for (const [year, points] of groups) {
		const x = (xs[points[0]!]! + xs[points.at(-1)!]!) / 2;
		const tick: AxisTick = { x, text: year, anchor: 'middle', points };
		const [from, to] = reach(tick);
		const prev = out.at(-1);
		if (from >= lo && to <= hi && (!prev || reach(prev)[1] <= from)) out.push(tick);
	}
	return out;
}

/** Round steps a crowded axis of years may name every so many of, smallest first. */
const YEAR_STEPS = [5, 10, 20, 25, 50];

/** Every `step`th year of an axis whose labels are all years, at the first step whose labels clear each
    other and both ends of the plot; null where none does. */
function steppedYears(ticks: AxisTick[]): AxisTick[] | null {
	if (!ticks.length || !ticks.every((t) => /^\d{4}$/.test(t.text))) return null;

	const [lo, hi] = [ticks[0]!.x, ticks.at(-1)!.x];
	for (const step of YEAR_STEPS) {
		const kept = ticks
			.filter((t) => Number(t.text) % step === 0)
			.map((t): AxisTick => ({ ...t, anchor: 'middle' }))
			.filter((t) => reach(t)[0] >= lo && reach(t)[1] <= hi);
		if (kept.length > 1 && clear(kept)) return kept;
	}
	return null;
}

/** Every x-label at `xs`, none overlapping: flat where they fit, else one name per year of `periods`, a
    thinned run of years, or turned labels with the bottom margin grown. `anchored` anchors ends inward. */
export function xAxisLabels(
	xs: number[],
	labels: string[],
	periods: string[] | undefined,
	anchored: boolean
): XAxis {
	const perPoint = labels.map((text, i): AxisTick => ({
		x: xs[i] ?? 0,
		text,
		anchor: anchored ? labelAnchor(i, labels.length) : 'middle',
		points: [i]
	}));
	if (clear(perPoint)) return { ticks: perPoint, angle: 0, bottom: FLAT_BOTTOM };

	if (periods?.length === labels.length && new Set(periods.map((p) => p.slice(0, 4))).size > 1) {
		return { ticks: yearTicks(xs, periods), angle: 0, bottom: FLAT_BOTTOM };
	}

	const stepped = steppedYears(perPoint);
	if (stepped) return { ticks: stepped, angle: 0, bottom: FLAT_BOTTOM };

	const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
	const angle = Math.min(...gaps) >= AXIS_LINE_H * Math.SQRT2 ? 45 : 90;
	const width = Math.max(...labels.map(labelWidth));
	const rise = angle === 45 ? width * Math.SQRT1_2 : width;
	return {
		ticks: perPoint.map((t) => ({ ...t, anchor: 'end' })),
		angle,
		bottom: Math.ceil(rise) + 12
	};
}

/** How wide a focus band reaches around a lone point on a continuous axis of `count` points. */
export function focusPad(count: number, innerWidth: number): number {
	return Math.min(48, count > 1 ? (innerWidth / (count - 1)) * 0.6 : 24);
}

/** Positions whose period falls within `mark`, or on an axis without periods, the one it labels. */
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

/** The grain a continuous axis picks at: a point picks the month or the year its period falls in. */
export type PickGrain = 'month' | 'year';

/** The period each point picks: its period cut to `grain`, else its label, on an axis without periods. */
export function pickKeys(
	labels: string[],
	periods: string[] | undefined,
	grain?: PickGrain
): string[] {
	const cut = grain === 'year' ? 4 : grain === 'month' ? 7 : undefined;
	return labels.map((label, i) => periods?.[i]?.slice(0, cut) ?? label);
}

export interface PickGroup {
	key: string;
	from: number;
	to: number;
}

/** Runs of neighbouring points that pick the same period, each reaching halfway to the next run, so the
    runs tile the plot from 0 to `width` and a click anywhere lands on one. */
export function pickGroups(xs: number[], keys: string[], width: number): PickGroup[] {
	const groups: { key: string; first: number; last: number }[] = [];
	keys.forEach((key, i) => {
		const run = groups.at(-1);
		if (run?.key === key) run.last = i;
		else groups.push({ key, first: i, last: i });
	});
	return groups.map((g, n) => {
		const prev = groups[n - 1];
		const next = groups[n + 1];
		return {
			key: g.key,
			from: prev ? (xs[prev.last]! + xs[g.first]!) / 2 : 0,
			to: next ? (xs[g.last]! + xs[next.first]!) / 2 : width
		};
	});
}
