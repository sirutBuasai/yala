// The board's vocabulary. Three shapes, in the order the layers hand them along:
//
//   PaneSpec     — what a VIEW declares: a default rectangle, what kind of thing is inside, and (for
//                  a catalog figure) which figure — so a pane is declared in exactly one place.
//   AuthoredPane — what STORAGE holds: the rectangle the user authored, plus their height choice.
//   SizedPane    — what the RESOLVER reads: an authored pane whose height has been resolved to real
//                  units (a fitted pane's height comes from measuring it, so only this layer knows).
//
// Nothing here holds a resolved POSITION. Displacement is derived on every render and never
// stored: a saved arrangement would otherwise drift as the data changed, and a transient double
// mount (a hot reload, a view rendering one frame before the outgoing one unmounts) would see its
// own twin as a clash and write the escape it made from it.

import type { FigureSpec } from './figure';

/** A rectangle on the board: 0-based origin, spans in units. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Who owns a pane's height.
 *
 * `fixed` — the pane's; the content may leave it part-empty, and scrolls once it overflows.
 * `fit`   — the content's, without limit; the pane extends indefinitely and never scrolls.
 * `cap`   — the content's, up to a ceiling the user sets by dragging the bottom edge.
 */
export type HeightMode = 'fixed' | 'fit' | 'cap';

/**
 * What is inside a pane, declared in code and NOT user-editable.
 *
 * `scale` — a chart, graph or diagram: it fills whatever box it is given and never has empty
 *           space, so resizing either axis scales it. There is only one sizing for these.
 * `flow`  — a list or form: content of its own height, which is what makes the three list
 *           sizings meaningful.
 *
 * Either wrong value breaks the pane, which is why the user can't set it: a list told to `scale`
 * clips with no scrollbar, and a chart told to `flow` collapses, since the figure box's own
 * min/max height clamps are lifted inside a grid pane.
 */
export type PaneContent = 'scale' | 'flow';

/** One pane as a view declares it. */
export interface PaneSpec extends Rect {
	content: PaneContent;
	/** Default height mode. Ignored for `scale`, which is always `fixed`. */
	mode?: HeightMode;
	/** Default ceiling in units for `mode: 'cap'`; defaults to `h`. */
	cap?: number;
	/** What this pane draws, when its content is a catalog figure rather than markup the view writes
	    out itself. The state layers ignore it; only the render site reads it. */
	figure?: FigureSpec;
}

/** A view's whole default arrangement, keyed by pane id: every pane it has, declared exactly once,
    geometry and figure together. Key order is the resolver's default priority order. */
export type BoardLayout<K extends string = string> = Record<K, PaneSpec>;

/** One pane exactly as the user authored it — the only thing persisted. */
export interface AuthoredPane extends Rect {
	id: string;
	mode: HeightMode;
	/** Ceiling for `mode: 'cap'`. Kept separate from `h`: storing it AS `h` re-baselines the pane,
	    so a capped list that has not reached its ceiling reads as having shrunk. */
	cap: number;
}

/** An authored pane whose height has been resolved to the units it actually reserves. */
export interface SizedPane extends Rect {
	id: string;
}

/** A pane at its final board position. */
export interface PlacedPane extends Rect {
	id: string;
	/** Rows this pane was pushed down by — the number a drag must subtract before saving. */
	offset: number;
}
