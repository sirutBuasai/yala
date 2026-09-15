// What a pane draws when its content is a catalog figure. Its own module because `types.ts` names this
// shape, so declaring it there would be a cycle.

import type { ColorBy } from '$lib/charts/registry';
import type { Scope } from '$lib/data/scope';
import type { Label } from '$lib/ui/label';

/** One figure on the board: which catalog id to build, at which scope, and how to draw it. */
export interface FigureSpec {
	figure: string;
	scope: Scope;
	/** Chart id; defaults to the first chart for the primitive's kind (stat for scalars). */
	chart?: string;
	/** Title override; a scalar otherwise titles itself with its label. */
	title?: Label;
	/** Subtitle override; a scalar otherwise uses its note. */
	caption?: Label;
	area?: boolean;
	color?: string;
	/** What a categorical's keys name (categories, accounts, roles) — drives their colours. */
	colorBy?: ColorBy;
	total?: number;
	/** Log-scale a line chart's value axis. */
	log?: boolean;
	/** Label lines at their right edge instead of drawing a legend. */
	endLabels?: boolean;
	/** Series names to draw dotted. */
	dashed?: string[];
	/** Print each bar's own figure above it (a lone series only). */
	valueLabels?: boolean;
	/** Heatmap scaling: per row (default) or one scale for the whole grid. */
	normalize?: 'row' | 'col' | 'global';
}

/**
 * The figure-bearing entries of a view's pane table, in declaration order, with the figure
 * non-optional so the call site needs no assertion. `content` is in the constraint only to keep it
 * from being all-optional, which TypeScript would match against every pane.
 */
export function figurePanes<K extends string, P extends { content: unknown; figure?: FigureSpec }>(
	panes: Record<K, P>
): [K, FigureSpec][] {
	return (Object.entries(panes) as [K, P][]).flatMap(([id, pane]) =>
		pane.figure ? [[id, pane.figure] as [K, FigureSpec]] : []
	);
}
