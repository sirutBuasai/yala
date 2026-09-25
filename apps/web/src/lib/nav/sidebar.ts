// Whether the sidebar docks beside the page or folds into the hamburger sheet.

import { ONE_COLUMN, WRAP_PAD } from '$lib/layout/grid/units';

/** Sidebar width in px, shared by the docked sidebar and the sheet. */
export const SIDEBAR_W = 264;

/** Docked only while the page beside it keeps more than a one-column board, so docking never folds one. */
export function docks(viewport: number): boolean {
	return viewport - SIDEBAR_W - 2 * WRAP_PAD > ONE_COLUMN;
}
