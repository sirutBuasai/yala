// Where each page was left in this tab: which view it showed, and how far down each view was scrolled
// (D22, D30). Its picks are not kept: the URL carries them for back and forward only. Session storage
// rather than local: it is about this visit, not a preference.

import { pageOf } from './pages';

const KEY = 'yala-page-state';

interface Left {
	/** Each page's path as left, which names its view (D27). */
	views: Record<string, string>;
	/** How far down each path was left, in CSS pixels. */
	scrolls: Record<string, number>;
}

function read(): Left {
	try {
		const stored = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
		return { views: stored.views ?? {}, scrolls: stored.scrolls ?? {} };
	} catch {
		return { views: {}, scrolls: {} };
	}
}

function save(left: Left): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(left));
	} catch {
		// Storage refused: pages open fresh, at their default view and the top.
	}
}

export function remember(pathname: string): void {
	const left = read();
	left.views[pageOf(pathname)] = pathname;
	save(left);
}

export function rememberScroll(pathname: string, scroll: number): void {
	const left = read();
	left.scrolls[pathname] = scroll;
	save(left);
}

/** Keep each page's view but drop its scroll: what a reload means (D26, D27). */
export function forgetScroll(): void {
	save({ ...read(), scrolls: {} });
}

/** The path `page` was last left at, naming its view; its own path when it was never visited. */
export const viewAt = (page: string): string => read().views[page] ?? page;

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
