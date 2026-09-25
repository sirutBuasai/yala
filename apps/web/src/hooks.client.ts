// Runs once, before the router reads the address or restores a scroll position.

import { forgetPages } from '$lib/nav/left';

/**
 * A reload starts the view over: the page's picks, filters and scroll return to their defaults, and so
 * does every other page the sidebar would reopen (D26). Preferences such as board arrangements and the
 * theme live in local storage and are untouched.
 */
export function init(): void {
	const nav = performance.getEntriesByType('navigation')[0] as
		PerformanceNavigationTiming | undefined;
	if (nav?.type !== 'reload') return;
	forgetPages();
	// A fresh history state too, so the router has no saved scroll to return to.
	history.replaceState(null, '', location.pathname);
}
