import { describe, expect, it } from 'vitest';
import { figurePanes } from '$lib/layout/grid/figure';
import type { BoardLayout } from '$lib/layout/grid/types';

const all = { level: 'all' } as const;

describe('figurePanes', () => {
	it('keeps declaration order, which is the order the panes render in', () => {
		const panes = {
			trend: { x: 0, y: 0, w: 48, h: 15, content: 'scale', figure: { figure: 'a', scope: all } },
			flow: { x: 0, y: 15, w: 48, h: 19, content: 'scale', figure: { figure: 'b', scope: all } },
			table: { x: 0, y: 34, w: 48, h: 16, content: 'scale', figure: { figure: 'c', scope: all } }
		} satisfies BoardLayout;

		expect(figurePanes(panes).map(([id, figure]) => [id, figure.figure])).toEqual([
			['trend', 'a'],
			['flow', 'b'],
			['table', 'c']
		]);
	});

	it('skips the panes a view renders itself', () => {
		const panes = {
			stats: { x: 0, y: 0, w: 48, h: 7, content: 'flow', mode: 'fit' },
			trend: { x: 0, y: 7, w: 48, h: 15, content: 'scale', figure: { figure: 'a', scope: all } }
		} satisfies BoardLayout;

		expect(figurePanes(panes).map(([id]) => id)).toEqual(['trend']);
	});

	it('gives nothing for a table with no figures at all', () => {
		expect(figurePanes({} satisfies BoardLayout)).toEqual([]);
		expect(
			figurePanes({
				stats: { x: 0, y: 0, w: 48, h: 7, content: 'flow', mode: 'fit' }
			} satisfies BoardLayout)
		).toEqual([]);
	});
});
