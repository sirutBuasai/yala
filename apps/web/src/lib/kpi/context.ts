// A board's KPI grouping, in context: a card is rendered per group leader, but the merge control it
// draws is about its NEIGHBOUR, so every KPI card needs the whole board's grouping, not a prop.

import { getContext, setContext } from 'svelte';
import type { KpiBoard } from './board.svelte';

const KEY = Symbol('kpi-board');

export function setKpiBoard(board: KpiBoard): void {
	setContext(KEY, board);
}

export function getKpiBoard(): KpiBoard {
	const board = getContext<KpiBoard | undefined>(KEY);
	if (!board) throw new Error('kpi: no KpiBoard in context — the view must call setKpiBoard()');
	return board;
}
