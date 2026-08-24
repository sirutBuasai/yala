import { scaleLinear, type ScaleLinear } from 'd3-scale';

/**
 * Zero-anchored linear value→pixel Y scale, plus its tick values. Shared by the bar and
 * line charts so they all include zero, `nice()`-round the domain, and tick identically.
 * `ih` is the inner (plot) height in pixels; the scale maps the max value to y=0 (top).
 */
export function moneyYScale(
	values: number[],
	ih: number
): { y: ScaleLinear<number, number>; ticks: number[] } {
	const y = scaleLinear()
		.domain([Math.min(0, ...values), Math.max(0, ...values)])
		.nice()
		.range([ih, 0]);

	return { y, ticks: y.ticks(4) };
}
