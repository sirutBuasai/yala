// Runs once, before the router reads the address or restores a scroll position.

import { forgetPicks } from '$lib/nav/left';

/** A reload keeps the view (the path) but drops the picks (the query) and every view's remembered query and
    scroll. Local-storage preferences are untouched. */
export function init(): void {
	const nav = performance.getEntriesByType('navigation')[0] as
		PerformanceNavigationTiming | undefined;
	if (nav?.type !== 'reload') return;
	forgetPicks();
	// A fresh history state too, so the router has no saved scroll to return to.
	history.replaceState(null, '', location.pathname);
}
