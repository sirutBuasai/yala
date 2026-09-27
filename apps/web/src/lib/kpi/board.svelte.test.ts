import { beforeEach, describe, expect, it } from 'vitest';
import { KpiBoard } from './board.svelte';
import type { KpiBoardDefs, KpiSpec } from './spec';

const spec = { figure: 'x' } as KpiSpec;
const DEFS: KpiBoardDefs = {
	a: { rect: { x: 0, y: 0, w: 12, h: 5 }, spec },
	b: { rect: { x: 12, y: 0, w: 12, h: 5 }, spec }
};

let seq = 0;

/** A board whose stored grouping is `stored`, as a reload would find it. */
function boardWith(stored: unknown): KpiBoard {
	const key = `test-${seq++}`;
	localStorage.setItem(`yala-kpi-${key}`, JSON.stringify(stored));
	return new KpiBoard(key, () => DEFS);
}

beforeEach(() => localStorage.clear());

describe('a stored KPI grouping', () => {
	it('is read back when its weights are positive numbers', () => {
		const board = boardWith([{ ids: ['a', 'b'], axis: 'row', weights: [12, 12] }]);
		expect(board.groups.map((g) => g.ids)).toEqual([['a', 'b']]);
	});

	it.each([
		['zero', [12, 0]],
		['negative', [12, -3]],
		['a string', [12, '12']],
		['missing', [12]]
	])('is dropped when a weight is %s', (_, weights) => {
		const board = boardWith([{ ids: ['a', 'b'], axis: 'row', weights }]);
		expect(board.groups.map((g) => g.ids)).toEqual([['a'], ['b']]);
	});
});
