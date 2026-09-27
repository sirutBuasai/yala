// What a pane draws when its content is a catalog figure. Its own module because `types.ts` names this
// shape, so declaring it there would be a cycle.

import type { ChartOptions } from '$lib/charts/registry';
import type { Scope } from '$lib/data/scope';
import type { Label } from '$lib/ui/label';

/** One figure on the board: which catalog id to build, at which scope, and how to draw it. */
export interface FigureSpec extends ChartOptions {
	figure: string;
	scope: Scope;
	/** Chart id; defaults to the first chart for the primitive's kind (stat for scalars). */
	chart?: string;
	/** Title override; a scalar otherwise titles itself with its label. */
	title?: Label;
	/** Subtitle override; a scalar otherwise uses its note. */
	caption?: Label;
}

/** Figure non-optional, so the call site needs no assertion. `content` keeps the constraint from being
    all-optional, which TypeScript would match against every pane. */
export function figurePanes<K extends string, P extends { content: unknown; figure?: FigureSpec }>(
	panes: Record<K, P>
): [K, FigureSpec][] {
	return (Object.entries(panes) as [K, P][]).flatMap(([id, pane]) =>
		pane.figure ? [[id, pane.figure] as [K, FigureSpec]] : []
	);
}
