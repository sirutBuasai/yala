// How much room the sidebar takes (docs/redesign D13): all of it while a full board still fits beside
// it, an icon rail while only the rail does, and the hamburger sheet once even the rail would fold the
// board to one column.

import { CONTENT, ONE_COLUMN, WRAP_PAD } from '$lib/layout/grid/units';

/** Sidebar width in px when shown in full, and the width it expands to from the rail. */
export const SIDEBAR_W = 264;
/** Icon rail width in px. Narrow enough that a 1440px window still fits a full board beside it. */
export const RAIL_W = 48;

export type SidebarMode = 'full' | 'rail' | 'sheet';

const pageWidth = (viewport: number, side: number) => viewport - side - 2 * WRAP_PAD;

export function sidebarMode(viewport: number): SidebarMode {
	if (pageWidth(viewport, SIDEBAR_W) >= CONTENT) return 'full';
	return pageWidth(viewport, RAIL_W) > ONE_COLUMN ? 'rail' : 'sheet';
}
