// The board's vocabulary: what a view declares, what storage holds, what the resolver reads.
//
// Nothing here holds a resolved POSITION. Displacement is derived every render and never stored, so a
// transient double mount cannot see its own twin as a clash and persist the escape it made from it.

import type { FigureSpec } from './figure';

/** A rectangle on the board: 0-based origin, spans in units. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Who owns a pane's height: `fixed` the pane (content scrolls past the edge), `fit` the content
 * (unbounded, never scrolls), `cap` the content up to a ceiling the user drags.
 */
export type HeightMode = 'fixed' | 'fit' | 'cap';

/**
 * What is inside a pane. Declared in code, not user-editable, because either wrong value breaks the
 * pane: a list told to `scale` clips with no scrollbar, and a chart told to `flow` collapses, since a
 * grid pane lifts the figure box's own height clamps.
 */
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
	/** Rows this pane was pushed down by — what a drag must subtract before saving. */
	offset: number;
}
