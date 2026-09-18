// How a chart words the figures it draws. One reader per unit, so two charts over the same primitive
// cannot label it differently.

import { formatUnit, formatUnitCompact, formatUnitExact, type Unit } from '$lib/data/primitives';
import { moneyAxisFormat } from '$lib/charts/axis';

/** The readings a chart needs of one value: in the plot, in a tooltip, and on the value axis. */
export interface ChartFormat {
	/** A figure printed in the plot at full width. */
	plain(v: number): string;
	/** The same figure where the box is narrow enough to want the thousands abbreviated. */
	compact(v: number): string;
	/** What a tooltip states, money to the cent. */
	exact(v: number): string;
	/** An axis tick. */
	tick(v: number): string;
}

/**
 * `ticks` are the labels the value axis is about to draw, which is what decides whether a money axis
 * abbreviates — see `moneyAxisFormat`. Omit them for a chart with no value axis.
 */
export function chartFormat(unit: Unit, ticks: number[] = []): ChartFormat {
	const moneyTick = moneyAxisFormat(ticks);

	return {
		plain: (v) => formatUnit(v, unit),
		compact: (v) => formatUnitCompact(v, unit),
		exact: (v) => formatUnitExact(v, unit),
		// A percentage tick is left unrounded: d3 puts ticks on quarters, and rounding a 2.5 to "3"
		// labels a gridline with a value it is not drawn at.
		tick: (v) =>
			unit.kind === 'money' ? moneyTick(v) : unit.kind === 'percent' ? `${v}%` : formatUnit(v, unit)
	};
}
