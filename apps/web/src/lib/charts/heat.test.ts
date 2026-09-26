import { describe, expect, it } from 'vitest';
import type { Table } from '$lib/data/primitives';
import { MONEY, PERCENT } from '$lib/data/primitives';
import { tableGrid } from './heat';

const table: Table = {
	kind: 'table',
	columns: [
		{ label: 'Date' },
		{ label: 'Net worth', unit: MONEY('USD') },
		{ label: 'Change', unit: MONEY('USD'), tint: 'up-good' },
		{ label: 'Change %', unit: PERCENT, tint: 'up-good' }
	],
	rows: [
		['Jan 1', 1234.5, 200, 10],
		['Feb 1', 1034.5, -200, -16]
	]
};

describe('tableGrid', () => {
	it('labels rows by the first column and keeps money to the cent', () => {
		const grid = tableGrid(table);
		expect(grid.rows).toEqual(['Jan 1', 'Feb 1']);
		expect(grid.cols).toEqual(['Net worth', 'Change', 'Change %']);
		expect(grid.cells[0]![0]!.text).toBe('1,234.50');
	});

	it('shades only the tinted columns, by which way the news runs', () => {
		const [rise, fall] = tableGrid(table).cells;
		expect(rise![0]!.tile).toBeNull();
		expect(rise![1]!.tile).toBe('var(--good)');
		expect(fall![1]!.tile).toBe('var(--crit)');
	});

	it('carries no totals, since levels and changes do not add up', () => {
		expect(tableGrid(table).totals).toBeUndefined();
	});
});
