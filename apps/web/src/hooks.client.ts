// Runs once, before the router reads the address or restores a scroll position.

import { forgetPicks } from '$lib/nav/left';

/**
 * A reload keeps the view but starts its picks over (D26, D27). The path names the view and is kept; the
 * query holds the picks and filters and is dropped, here and on every page the sidebar would reopen, with
 * their scroll. Preferences such as board arrangements and the theme live in local storage, untouched.
 */
export function init(): void {
	const nav = performance.getEntriesByType('navigation')[0] as
		PerformanceNavigationTiming | undefined;
	if (nav?.type !== 'reload') return;
	forgetPicks();
	// A fresh history state too, so the router has no saved scroll to return to.
	history.replaceState(null, '', location.pathname);
}
