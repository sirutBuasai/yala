// The page writes `width` and everything about folding derives from it, so no two components disagree.

import { foldMode, foldColumns, WRAP_PAD, type FoldMode } from './units';

export class GridEnv {
	/** `.wrap`'s client width in px, written by the page. */
	width = $state(0);

	/** `arranging` is whether the affordances show. Page-level so it survives a tab switch; not persisted, so a
	    new session doesn't open in Edit. */
	arrangeRequested = $state(false);

	/** Boards on the current page. The shell's Edit toggle only means something while one is mounted. */
	boards = $state(0);

	readonly content = $derived(Math.max(0, this.width - 2 * WRAP_PAD));
	readonly foldMode = $derived<FoldMode>(foldMode(this.content));
	readonly folded = $derived(this.foldMode !== 'full');
	readonly columns = $derived(foldColumns(this.foldMode));

	/** Arranging is only offered for a board on screen, and only when the full content column fits (see
	    `foldMode`). */
	readonly canArrange = $derived(this.boards > 0 && this.foldMode === 'full');

	/** Requested and possible — the one every component reads. */
	readonly arranging = $derived(this.arrangeRequested && this.canArrange);
}
