// Where each page and view was left in this tab. Every view (every path) keeps its own URL state and
// its own scroll, so switching between views or pages returns each to how it was left, and a pick on one
// never moves another. Session storage rather than local: it is about this visit, not a preference.

import { goto } from '$app/navigation';
import { onPress } from '$lib/charts/aria';
import { pageOf } from './pages';

const KEY = 'yala-page-state';

interface Left {
	/** Each page's path as left, which names its view. */
	views: Record<string, string>;
	/** Each path's query as left, its picks and filters. */
	searches: Record<string, string>;
	/** How far down each path was left, in CSS pixels. */
	scrolls: Record<string, number>;
}

function read(): Left {
	try {
		const stored = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
		return {
			views: stored.views ?? {},
			searches: stored.searches ?? {},
			scrolls: stored.scrolls ?? {}
		};
	} catch {
		return { views: {}, searches: {}, scrolls: {} };
	}
}

function save(left: Left): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(left));
	} catch {
		// Storage refused: pages open fresh, at their default view and the top.
	}
}

export function remember(url: URL): void {
	const left = read();
	left.views[pageOf(url.pathname)] = url.pathname;
	left.searches[url.pathname] = url.search;
	save(left);
}

export function rememberScroll(pathname: string, scroll: number): void {
	const left = read();
	left.scrolls[pathname] = scroll;
	save(left);
}

/** Keep each page's view but drop every view's picks and scroll: what a reload means. */
export function forgetPicks(): void {
	save({ ...read(), searches: {}, scrolls: {} });
}

/** The path `page` was last left at, naming its view; its own path when it was never visited. */
export const viewAt = (page: string): string => read().views[page] ?? page;

/** `pathname` with the query it was last left with. */
export const leftAt = (pathname: string): string => pathname + (read().searches[pathname] ?? '');

/** How far down, in CSS pixels, `pathname` was last left. */
export const scrollAt = (pathname: string): number => read().scrolls[pathname] ?? 0;

/**
 * Scroll back to `y` once the page is tall enough to hold it. A board's panes are measured over the frames
 * after navigation, so scrolling at once would clamp short of `y`. Stops early if the reader scrolls first.
 */
export function restoreScroll(y: number, frames = 60): void {
	const started = window.scrollY;
	const attempt = (left: number) => {
		if (window.scrollY !== started) return;
		const room = document.documentElement.scrollHeight - window.innerHeight;
		if (room >= y || left === 0) {
			window.scrollTo(0, Math.min(y, room));
			return;
		}
		requestAnimationFrame(() => attempt(left - 1));
	};
	attempt(frames);
}

/** Attributes that make a card's title a link to `page`, opened as the sidebar opens it: at the view it
    was left on, as that view was left. A heading rather than an anchor, since the title is also what
    a rename edits. Spread, so a title with no page gets none of them. */
export function pageLink(page: string) {
	const open = () => void goto(leftAt(viewAt(page)));
	return {
		role: 'link',
		tabindex: 0,
		onclick: open,
		onkeydown: (e: KeyboardEvent) => onPress(e, open)
	};
}
