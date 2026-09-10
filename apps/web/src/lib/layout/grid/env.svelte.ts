// Page-level grid state: how wide the content column actually is, and whether the user is
// arranging. Runes only — no DOM. The page measures itself and writes `width` here; everything
// else about how the board folds is derived, so no two components can disagree about it.

import { foldMode, foldColumns, WRAP_PAD, type FoldMode } from './units';

export class GridEnv {
	/** `.wrap`'s client width in px, written by the page. */
	width = $state(0);

	/**
	 * Whether the user has ASKED for the arrange affordances. Whether they are actually showing is
	 * `arranging`, which also weighs whether the board can be arranged at all.
	 *
	 * Page-level, so it holds across a tab switch — laying the app out is one job spanning several
	 * boards, and re-entering the mode per tab made it four jobs. Nothing is at risk in carrying it
	 * over: a board commits on every gesture, so the one being left is already saved.
	 *
	 * Not PERSISTED, though: arranging is something you are doing, not a mode the app is in, and
	 * coming back tomorrow to a board wearing drag grips is a worse greeting than one extra click.
	 */
	arrangeRequested = $state(false);

	readonly content = $derived(Math.max(0, this.width - 2 * WRAP_PAD));
	readonly foldMode = $derived<FoldMode>(foldMode(this.content));
	readonly folded = $derived(this.foldMode !== 'full');
	readonly columns = $derived(foldColumns(this.foldMode));

	/** Arranging is only offered when the full content column fits: the stored coordinates describe
	    a 48-column board, and there is nothing honest to do with them on a narrower one. */
	readonly canArrange = $derived(this.foldMode === 'full');

	/** Requested AND able to — the one every component reads. */
	readonly arranging = $derived(this.arrangeRequested && this.canArrange);
}
