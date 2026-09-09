// Page-level grid state: how wide the content column actually is, and whether the user is
// arranging. Runes only — no DOM. The page measures itself and writes `width` here; everything
// else about the board's mode is derived, so no two components can disagree about it.

import { boardWidth, foldColumns, WRAP_PAD, type BoardWidth } from './units';

export class GridEnv {
	/** `.wrap`'s client width in px, written by the page. */
	width = $state(0);

	/**
	 * Whether the arrange affordances are showing.
	 *
	 * Page-level, so it holds across a tab switch — laying the app out is one job spanning several
	 * boards, and re-entering the mode per tab made it four jobs. Nothing is at risk in carrying it
	 * over: a board commits on every gesture, so the one being left is already saved.
	 *
	 * Not PERSISTED, though: arranging is something you are doing, not a mode the app is in, and
	 * coming back tomorrow to a board wearing drag grips is a worse greeting than one extra click.
	 */
	arranging = $state(false);

	readonly content = $derived(Math.max(0, this.width - 2 * WRAP_PAD));
	readonly mode = $derived<BoardWidth>(boardWidth(this.content));
	readonly folded = $derived(this.mode !== 'full');
	readonly columns = $derived(foldColumns(this.mode));

	/** Arranging is only offered when the full content column fits: the stored coordinates describe
	    a 48-column board, and there is nothing honest to do with them on a narrower one. */
	readonly canArrange = $derived(this.mode === 'full');

	/** Arranging AND able to. Components should read this, never `arranging` alone. */
	readonly active = $derived(this.arranging && this.canArrange);
}
