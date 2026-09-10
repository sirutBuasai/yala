// Page-level grid state: how wide the content column actually is, and whether the user is arranging.
// The page measures itself and writes `width`; everything about folding derives from it, so no two
// components can disagree.

import { foldMode, foldColumns, WRAP_PAD, type FoldMode } from './units';

export class GridEnv {
	/** `.wrap`'s client width in px, written by the page. */
	width = $state(0);

	/**
	 * Whether the user has ASKED for the arrange affordances; `arranging` is whether they show. Held
	 * page-level so it survives a tab switch, since laying the app out is one job spanning several
	 * boards, and not persisted, so a new session does not open wearing drag grips.
	 */
	arrangeRequested = $state(false);

	readonly content = $derived(Math.max(0, this.width - 2 * WRAP_PAD));
	readonly foldMode = $derived<FoldMode>(foldMode(this.content));
	readonly folded = $derived(this.foldMode !== 'full');
	readonly columns = $derived(foldColumns(this.foldMode));

	/** Arranging is only offered when the full content column fits (see `foldMode`). */
	readonly canArrange = $derived(this.foldMode === 'full');

	/** Requested AND possible — the one every component reads. */
	readonly arranging = $derived(this.arrangeRequested && this.canArrange);
}
