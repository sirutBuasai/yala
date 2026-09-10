// What a pane draws when its content is a catalog figure. It lives beside the board's vocabulary
// rather than in it: `types.ts` names this shape, so importing that back from here would be a cycle.

import type { ColorBy } from '$lib/charts/registry';
import type { Scope } from '$lib/data/scope';

/**
 * One figure on the board: which catalog id to build, at which scope, and how to draw it.
 * Exported so a view can annotate the pane it hangs off and have the literals type-checked where
 * they're written rather than where they're passed.
 */
export interface FigureSpec {
	/** Catalog id to build. */
	figure: string;
	scope: Scope;
	/** Chart id; defaults to the first chart for the primitive's kind (stat for scalars). */
	chart?: string;
	/** Title override; a scalar otherwise titles itself with its label. */
	title?: string;
	/** Subtitle override; a scalar otherwise uses its note. */
	caption?: string;
	area?: boolean;
	color?: string;
	/** What a categorical's keys name (categories, accounts, roles) — drives their colours. */
	colorBy?: ColorBy;
	total?: number;
	/** Log-scale a line chart's value axis. */
	log?: boolean;
	/** Label lines at their right edge instead of drawing a legend. */
	endLabels?: boolean;
	/** Series names to draw dotted — a secondary reading against a primary one. */
	dashed?: string[];
	/** Heatmap scaling: per row (default) or one scale for the whole grid. */
	normalize?: 'row' | 'global';
}

/**
 * The figure-bearing entries of a view's pane table, as `[id, figure]` pairs in declaration order,
 * so a render site can iterate them instead of naming the ids a second time. The figure comes out
 * non-optional, which is what removes the assertion at the call site.
 *
 * `content` is in the constraint only to keep it from being all-optional: TypeScript rejects an
 * object that shares no property with such a type, which would be every pane this function skips.
 */
export function figurePanes<K extends string, P extends { content: unknown; figure?: FigureSpec }>(
	panes: Record<K, P>
): [K, FigureSpec][] {
	return (Object.entries(panes) as [K, P][]).flatMap(([id, pane]) =>
		pane.figure ? [[id, pane.figure] as [K, FigureSpec]] : []
	);
}
