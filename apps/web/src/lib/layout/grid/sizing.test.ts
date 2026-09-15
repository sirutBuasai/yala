import { describe, expect, it } from 'vitest';
import { effectiveMode, hugs, reservedRows, scrolls, sizePanes } from '$lib/layout/grid/sizing';
import { COLS, UNIT, GAP, rowsForPx } from '$lib/layout/grid/units';
import type { AuthoredPane, BoardLayout } from '$lib/layout/grid/types';

const authored = (over: Partial<AuthoredPane> = {}): AuthoredPane => ({
	id: 'x',
	x: 0,
	y: 0,
	w: 24,
	h: 8,
	mode: 'fixed',
	cap: 12,
	...over
});

describe('effectiveMode', () => {
	it('forces a chart to fixed — it has no content height to fit to', () => {
		expect(effectiveMode('scale', 'fit')).toBe('fixed');
		expect(effectiveMode('scale', 'cap')).toBe('fixed');
	});

	it('leaves a list alone', () => {
		expect(effectiveMode('flow', 'fit')).toBe('fit');
	});
});

describe('hugs / scrolls', () => {
	it('a fitted card hugs its content; a fixed one fills its cell', () => {
		expect(hugs('fit')).toBe(true);
		expect(hugs('cap')).toBe(true);
		expect(hugs('fixed')).toBe(false);
	});

	it('only a bounded list scrolls: a chart fills, an unbounded list extends', () => {
		expect(scrolls('flow', 'fixed')).toBe(true);
		expect(scrolls('flow', 'cap')).toBe(true);
		expect(scrolls('flow', 'fit')).toBe(false);
		expect(scrolls('scale', 'fixed')).toBe(false);
	});
});

describe('rowsForPx', () => {
	it('counts the pane inset in, so a card of N units of card is N units of grid', () => {
		expect(rowsForPx(6 * UNIT - GAP)).toBe(6);
	});

	it('rounds a part-used row up, and never reports less than one', () => {
		expect(rowsForPx(6 * UNIT - GAP + 1)).toBe(7);
		expect(rowsForPx(0)).toBe(1);
	});
});

describe('reservedRows', () => {
	it('a chart reserves the height it was given, whatever it measured', () => {
		expect(reservedRows(authored(), 'scale', 4000, false)).toBe(8);
	});

	it('a fixed list reserves its set height, even with two rows in it', () => {
		expect(reservedRows(authored({ mode: 'fixed' }), 'flow', 40, false)).toBe(8);
	});

	it('a fitted list reserves what it measured, without limit', () => {
		const tall = 30 * UNIT - GAP;
		expect(reservedRows(authored({ mode: 'fit' }), 'flow', tall, false)).toBe(30);
	});

	it('a capped list stops at its ceiling', () => {
		const tall = 30 * UNIT - GAP;
		expect(reservedRows(authored({ mode: 'cap', cap: 12 }), 'flow', tall, false)).toBe(12);
	});

	it('a capped list under its ceiling reserves only what it uses — in normal mode', () => {
		const short = 5 * UNIT - GAP;
		expect(reservedRows(authored({ mode: 'cap', cap: 12 }), 'flow', short, false)).toBe(5);
	});

	it('but reserves the WHOLE ceiling while arranging, so nothing is placed in its room to grow', () => {
		const short = 5 * UNIT - GAP;
		expect(reservedRows(authored({ mode: 'cap', cap: 12 }), 'flow', short, true)).toBe(12);
	});

	it('falls back to the authored height before the first measurement', () => {
		expect(reservedRows(authored({ mode: 'fit', h: 9 }), 'flow', undefined, false)).toBe(9);
	});
});

describe('sizePanes', () => {
	const specs: BoardLayout = {
		chart: { x: 0, y: 0, w: 24, h: 10, content: 'scale' },
		list: { x: 24, y: 0, w: 24, h: 6, content: 'flow', mode: 'fit' }
	};
	const panes = [
		authored({ id: 'list', x: 24, mode: 'fit', h: 6 }),
		authored({ id: 'chart', h: 10 })
	];
	const measured = { list: 20 * UNIT - GAP };
	const size = (floors: Parameters<typeof sizePanes>[3] = {}) =>
		new Map(sizePanes(panes, specs, measured, floors, false).map((p) => [p.id, p]));

	it('resolves each pane by its own kind and keeps the priority order', () => {
		const sized = sizePanes(panes, specs, measured, {}, false);
		expect(sized.map((s) => [s.id, s.h])).toEqual([
			['list', 20],
			['chart', 10]
		]);
	});

	it('widens any pane to the columns its content needs', () => {
		expect(size({ list: { w: 30, h: 0 } }).get('list')!.w).toBe(30);
		expect(size({ chart: { w: 30, h: 0 } }).get('chart')!.w).toBe(30);
	});

	it('leaves a pane already wide enough alone', () => {
		expect(size({ chart: { w: 20, h: 0 } }).get('chart')!.w).toBe(24);
	});

	it('shifts a widened pane off the right edge rather than overrunning the board', () => {
		const list = size({ list: { w: 30, h: 0 } }).get('list')!;
		expect(list.x + list.w).toBeLessThanOrEqual(COLS);
		expect(list.x).toBe(COLS - 30);
	});

	it('caps growth at the board width', () => {
		expect(size({ chart: { w: COLS + 12, h: 0 } }).get('chart')!.w).toBe(COLS);
	});

	it('grows a chart to the rows its content needs — nothing else owns its height', () => {
		expect(size({ chart: { w: 0, h: 14 } }).get('chart')!.h).toBe(14);
	});

	it('leaves a fitted list to its own measurement, which tracks content both ways', () => {
		expect(size({ list: { w: 0, h: 40 } }).get('list')!.h).toBe(20);
	});
});
