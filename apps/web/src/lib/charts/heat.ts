// Tiles a heatmap draws, whichever primitive they came from. A Matrix and a Table shade differently, so
// each has its own builder.

import type { Matrix, Table, Unit } from '$lib/data/primitives';
import { formatUnit, formatUnitExact } from '$lib/data/primitives';
import { amountExact, amountWhole, numCompact } from '$lib/utils/format';

/** For a band with no colour of its own. */
const FALLBACK = 'var(--lav)';

export interface HeatCell {
	/** The figure, fullest first: shown as fully as every tile has room for (see `Reading`). */
	readings: string[];
	/** The exact figure, for the tooltip. */
	tip: string;
	/** The hue behind the tile, or null for a tile left unshaded. */
	tile: string | null;
	/** How deep the hue runs, 0..1; the theme scales it. */
	a: number;
}

export interface HeatGrid {
	rows: string[];
	cols: string[];
	cells: HeatCell[][];
	/** A Total column and row, where the cells add up to anything; readings as a cell's. */
	totals?: { rows: string[][]; cols: string[][]; grand: string[] };
}

/** A figure's readings on a tile: to the cent, whole, abbreviated. Money drops its symbol: every tile of a
    band is money, and it costs the width a narrow tile cannot spare. */
function tileReadings(value: number, unit: Unit): string[] {
	if (unit.kind !== 'money') return [formatUnit(value, unit)];
	return [...new Set([amountExact(value), amountWhole(value), numCompact(value)])];
}

function cellOf(value: number, unit: Unit, tile: string | null, a: number): HeatCell {
	return { readings: tileReadings(value, unit), tip: formatUnitExact(value, unit), tile, a };
}

/** Each band scales to its own max: categories span orders of magnitude, so one grid-wide scale leaves the
    median cell blank. `normalize` names the band's axis; a credit carries no heat. */
export function matrixGrid(
	m: Matrix,
	normalize: 'row' | 'col' | 'global',
	colors?: string[]
): HeatGrid {
	const { rows, cols, values, unit } = m;
	const cell = (i: number, j: number) => values[i]?.[j] ?? 0;

	const globalMax = Math.max(1, ...values.flat().map(Math.abs));
	const rowMax = rows.map((_, i) => Math.max(1, ...(values[i] ?? []).map(Math.abs)));
	const colMax = cols.map((_, j) => Math.max(1, ...rows.map((_, i) => Math.abs(cell(i, j)))));
	const scaleOf = (i: number, j: number) =>
		normalize === 'row' ? rowMax[i]! : normalize === 'col' ? colMax[j]! : globalMax;
	const hue = (i: number, j: number) =>
		normalize === 'global' ? FALLBACK : (colors?.[normalize === 'row' ? i : j] ?? FALLBACK);

	const rowTotal = rows.map((_, i) => cols.reduce((a, _c, j) => a + cell(i, j), 0));
	const colTotal = cols.map((_, j) => rows.reduce((a, _r, i) => a + cell(i, j), 0));
	const grand = colTotal.reduce((a, b) => a + b, 0);

	return {
		rows,
		cols,
		cells: rows.map((_, i) =>
			cols.map((_, j) => {
				const v = cell(i, j);
				return cellOf(v, unit, hue(i, j), v <= 0 ? 0 : Math.min(1, v / scaleOf(i, j)));
			})
		),
		totals: {
			rows: rowTotal.map((v) => tileReadings(v, unit)),
			cols: colTotal.map((v) => tileReadings(v, unit)),
			grand: tileReadings(grand, unit)
		}
	};
}

/** Shaded per column against its own largest move, or a column of hundreds never tints beside one of tens of
    thousands. Null where nothing is shaded. */
export function tableShades(table: Table): ({ good: boolean; a: number } | null)[][] {
	const peaks = table.columns.map((c, j) =>
		c.tint
			? Math.max(
					...table.rows.map((r) => (typeof r[j] === 'number' ? Math.abs(r[j] as number) : 0))
				)
			: 0
	);

	return table.rows.map((row) =>
		row.map((value, j) => {
			const dir = table.columns[j]?.tint;
			const peak = peaks[j] ?? 0;
			if (!dir || typeof value !== 'number' || value === 0 || !peak) return null;
			return {
				good: value > 0 === (dir === 'up-good'),
				// Floored, so the smallest real movement is still distinguishable from none.
				a: 0.25 + 0.75 * (Math.abs(value) / peak)
			};
		})
	);
}

export const shadeHue = (good: boolean): string => `var(--${good ? 'good' : 'crit'})`;

/** A Table as tiles: its first column labels the rows, and only its tinted columns are shaded. Its levels
    and changes do not add up, so it carries no totals. */
export function tableGrid(table: Table): HeatGrid {
	const shades = tableShades(table);
	const columns = table.columns.slice(1);

	return {
		rows: table.rows.map((r) => String(r[0] ?? '')),
		cols: columns.map((c) => c.label),
		cells: table.rows.map((row, i) =>
			columns.map((c, k) => {
				const v = row[k + 1];
				const sh = shades[i]?.[k + 1];
				const value = typeof v === 'number' ? v : 0;
				return cellOf(
					value,
					c.unit ?? { kind: 'count' },
					sh ? shadeHue(sh.good) : null,
					sh?.a ?? 0
				);
			})
		)
	};
}
