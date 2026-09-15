// A board's KPI grouping, in context: a card is rendered per group leader, but the merge control it
// draws is about its neighbour, so every KPI card needs the whole board's grouping, not a prop.

import { getContext, setContext } from 'svelte';
import { KpiBoard } from './board.svelte';
import type { KpiBoardDefs, KpiMerge } from './spec';

const KEY = Symbol('kpi-board');

/** A view's own KPI board, in context. One call, so a board can never be built without being set —
    every KPI card on it would then throw for a context that isn't there. */
export function useKpiBoard(key: string, defs: () => KpiBoardDefs, merged?: KpiMerge[]): KpiBoard {
	const board = new KpiBoard(key, defs, merged);
	setContext(KEY, board);
	return board;
}

export function getKpiBoard(): KpiBoard {
	const board = getContext<KpiBoard | undefined>(KEY);
	if (!board) throw new Error('kpi: no KpiBoard in context — the view must call useKpiBoard()');
	return board;
}
