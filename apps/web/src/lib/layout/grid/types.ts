// No resolved positions: storing displacement let a transient double mount persist its escape from its twin.

import type { FigureSpec } from './figure';

/** A rectangle on the board: 0-based origin, spans in units. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Who owns the height: `fixed` the pane, `fit` the content, `cap` the content up to a dragged ceiling. */
export type HeightMode = 'fixed' | 'fit' | 'cap';

/** Declared in code: a list told to `scale` clips with no scrollbar, and a chart told to `flow` collapses. */
export type PaneContent = 'scale' | 'flow';

/** One pane as a view declares it. */
export interface PaneSpec extends Rect {
	content: PaneContent;
	/** Default height mode. Ignored for `scale`, which is always `fixed`. */
	mode?: HeightMode;
	/** Default ceiling in units for `mode: 'cap'`; defaults to `h`. */
	cap?: number;
	/** A catalog figure to draw instead of markup the view writes itself. Only the render site reads
	    it; the state layers ignore it. */
	figure?: FigureSpec;
}

/** The least spans a pane's content fits in, in units: any rectangle at least this on both axes fits. 0 on
    an axis never measured. */
export interface Floor {
	w: number;
	h: number;
}

/** A view's default arrangement. Key order is the resolver's default priority order. */
export type BoardLayout<K extends string = string> = Record<K, PaneSpec>;

/** One pane exactly as the user authored it — the only thing persisted. */
export interface AuthoredPane extends Rect {
	id: string;
	mode: HeightMode;
	/** Ceiling for `mode: 'cap'`, kept separate from `h`: storing it AS `h` re-baselines the pane, so a
	    capped list short of its ceiling reads as having shrunk. */
	cap: number;
}

/** An authored pane whose height has been resolved to the units it actually reserves. */
export interface SizedPane extends Rect {
	id: string;
}

export interface PlacedPane extends Rect {
	id: string;
	/** Rows this pane was pushed down by: how far its row sits below the top it was authored at. */
	offset: number;
}
