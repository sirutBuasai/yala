// Two contexts, one per scope. The page owns the environment (how wide, arranging or not); a board
// owns its own arrangement. A pane needs both and neither is a prop it should have to be handed.

import { getContext, setContext } from 'svelte';
import type { Arrangement } from './arrangement.svelte';
import type { GridEnv } from './env.svelte';

const ENV = Symbol('grid-env');
const ARRANGEMENT = Symbol('grid-arrangement');

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
