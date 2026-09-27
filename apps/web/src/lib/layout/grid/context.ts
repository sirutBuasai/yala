// Two contexts, one per scope. The page owns the environment (how wide, arranging or not); a board
// owns its own arrangement. A pane needs both and neither is a prop it should have to be handed.

import { getContext, setContext } from 'svelte';
import type { Arrangement } from './arrangement.svelte';
import type { GridEnv } from './env.svelte';
import type { BoardLabels } from './labels';

const ENV = Symbol('grid-env');
const ARRANGEMENT = Symbol('grid-arrangement');
const LABELS = Symbol('grid-labels');

/** Throws naming who should have provided it, so a misplaced component fails where it is mounted. */
function required<T>(key: symbol, missing: string): T {
	const value = getContext<T | undefined>(key);
	if (!value) throw new Error(`grid: ${missing}`);
	return value;
}

export function setGridEnv(env: GridEnv): void {
	setContext(ENV, env);
}

export function getGridEnv(): GridEnv {
	return required(ENV, 'no GridEnv in context; the page must call setGridEnv()');
}

/** For content drawn on a board or off one, such as a chart in the component gallery. */
export function tryGridEnv(): GridEnv | undefined {
	return getContext<GridEnv | undefined>(ENV);
}

export function setArrangement(arrangement: Arrangement): void {
	setContext(ARRANGEMENT, arrangement);
}

export function getArrangement(): Arrangement {
	return required(ARRANGEMENT, 'no arrangement in context; a Pane must be inside a Board');
}

export function setLabels(labels: BoardLabels): void {
	setContext(LABELS, labels);
}

export function getLabels(): BoardLabels {
	return required(LABELS, 'no labels in context; a Pane must be inside a Board');
}

/** Renaming is board state, so off a board there is nothing to rename into. */
export function tryLabels(): BoardLabels | undefined {
	return getContext<BoardLabels | undefined>(LABELS);
}
