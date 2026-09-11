// Two contexts, one per scope. The page owns the environment (how wide, arranging or not); a board
// owns its own arrangement. A pane needs both and neither is a prop it should have to be handed.

import { getContext, setContext } from 'svelte';
import type { Arrangement } from './arrangement.svelte';
import type { GridEnv } from './env.svelte';
import type { BoardLabels } from './labels';

const ENV = Symbol('grid-env');
const ARRANGEMENT = Symbol('grid-arrangement');
const LABELS = Symbol('grid-labels');

export function setGridEnv(env: GridEnv): void {
	setContext(ENV, env);
}

export function getGridEnv(): GridEnv {
	const env = getContext<GridEnv | undefined>(ENV);
	if (!env) throw new Error('grid: no GridEnv in context — the page must call setGridEnv()');
	return env;
}

export function setArrangement(arrangement: Arrangement): void {
	setContext(ARRANGEMENT, arrangement);
}

export function getArrangement(): Arrangement {
	const arrangement = getContext<Arrangement | undefined>(ARRANGEMENT);
	if (!arrangement)
		throw new Error('grid: no arrangement in context — a Pane must be inside a Board');
	return arrangement;
}

export function setLabels(labels: BoardLabels): void {
	setContext(LABELS, labels);
}

export function getLabels(): BoardLabels {
	const labels = getContext<BoardLabels | undefined>(LABELS);
	if (!labels) throw new Error('grid: no labels in context — a Pane must be inside a Board');
	return labels;
}

/** For a card that renders on a board OR on its own — a KPI in the component gallery, say. Renaming is
    board state, so off a board there is nothing to rename into. */
export function tryLabels(): BoardLabels | undefined {
	return getContext<BoardLabels | undefined>(LABELS);
}
