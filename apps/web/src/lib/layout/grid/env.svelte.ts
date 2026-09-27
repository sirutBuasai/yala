// The page writes `width` and everything about folding derives from it, so no two components disagree.

import { CONTENT, foldMode, foldColumns, folds, WRAP_PAD, type FoldMode } from './units';

/** The keyboard instructions every movable pane is described by, rendered once beside the Edit toggle. */
export const ARRANGE_HINT_ID = 'arrange-hint';

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
	readonly folded = $derived(folds(this.foldMode));
	/** What a full board is drawn at to fit the content column: 1 unless `scaled`. */
	readonly scale = $derived(this.foldMode === 'scaled' ? this.content / CONTENT : 1);
	readonly columns = $derived(foldColumns(this.foldMode));

	/** Arranging is only offered for a board on screen, and only when the full content column fits (see
	    `foldMode`). */
	readonly canArrange = $derived(this.boards > 0 && this.foldMode === 'full');

	/** Requested and possible — the one every component reads. */
	readonly arranging = $derived(this.arrangeRequested && this.canArrange);
}
