// Page-level grid state: how wide the content column actually is, and whether the user is
// arranging. Runes only — the page measures itself and writes `width` here, and everything about
// how the board folds is derived from it, so no two components can disagree.

import { foldMode, foldColumns, WRAP_PAD, type FoldMode } from './units';

export class GridEnv {
	/** `.wrap`'s client width in px, written by the page. */
	width = $state(0);

	/**
	 * Whether the user has ASKED for the arrange affordances; `arranging` is whether they show.
	 *
	 * Page-level, so it holds across a tab switch — laying the app out is one job spanning several
	 * boards. Nothing is at risk: a board commits on every gesture. Not persisted, though: coming back
	 * tomorrow to a board wearing drag grips is a worse greeting than one extra click.
	 */
	arrangeRequested = $state(false);

	readonly content = $derived(Math.max(0, this.width - 2 * WRAP_PAD));
	readonly foldMode = $derived<FoldMode>(foldMode(this.content));
	readonly folded = $derived(this.foldMode !== 'full');
	readonly columns = $derived(foldColumns(this.foldMode));

	/** Arranging is only offered when the full content column fits (see `foldMode`). */
	readonly canArrange = $derived(this.foldMode === 'full');

	/** Requested AND able to — the one every component reads. */
	readonly arranging = $derived(this.arrangeRequested && this.canArrange);
}
