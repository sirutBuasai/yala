// Two contexts, one per scope. The page owns the environment (how wide, arranging or not); a board
// owns its own panes. A cell needs both and neither is a prop it should have to be handed.

import { getContext, setContext } from 'svelte';
import type { BoardLayout } from './layout.svelte';
import type { GridEnv } from './env.svelte';

const ENV = Symbol('grid-env');
const BOARD = Symbol('grid-board');

export function setGridEnv(env: GridEnv): void {
	setContext(ENV, env);
}

export function getGridEnv(): GridEnv {
	const env = getContext<GridEnv | undefined>(ENV);
	if (!env) throw new Error('grid: no GridEnv in context — the page must call setGridEnv()');
	return env;
}

export function setBoard(board: BoardLayout): void {
	setContext(BOARD, board);
}

export function getBoard(): BoardLayout {
	const board = getContext<BoardLayout | undefined>(BOARD);
	if (!board) throw new Error('grid: no board in context — a Cell must be inside a Board');
	return board;
}
