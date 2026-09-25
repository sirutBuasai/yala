// Where each page was left in this tab, so reopening it from the sidebar restores its view, its picks and
// its scroll (D21, D22). Session storage rather than local: it is about this visit, not a preference. Keyed
// by page, since a page's views are paths under it (D27).

import { pageOf } from './pages';

const KEY = 'yala-page-state';

interface Left {
	/** The page's path as left, which names its view. */
	path: string;
	/** Its query as left: the picks and filters. */
	search: string;
	scroll: number;
}

function read(): Record<string, Left> {
	try {
		return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
	} catch {
		return {};
	}
}

function save(all: Record<string, Left>): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// Storage refused: pages open fresh, which is the old behaviour.
	}
}

function write(pathname: string, patch: Partial<Left>): void {
	const all = read();
	const page = pageOf(pathname);
	all[page] = { path: page, search: '', scroll: 0, ...all[page], ...patch };
	save(all);
}

export const remember = (url: URL) =>
	write(url.pathname, { path: url.pathname, search: url.search });
export const rememberScroll = (pathname: string, scroll: number) => write(pathname, { scroll });

/** Keep each page's view but drop its picks, filters and scroll: what a reload means (D26, D27). */
export function forgetPicks(): void {
	const all = read();
	for (const left of Object.values(all)) Object.assign(left, { search: '', scroll: 0 });
	save(all);
}

/** The path and query `page` was last left with; its own path and nothing when it was never visited. */
export function leftAt(page: string): { path: string; search: string } {
	const left = read()[page];
	return { path: left?.path ?? page, search: left?.search ?? '' };
}

/** How far down, in CSS pixels, the page `pathname` belongs to was last left. */
export const scrollAt = (pathname: string): number => read()[pageOf(pathname)]?.scroll ?? 0;

/**
 * Scroll back to `y` once the page is tall enough to hold it. A board's panes are measured over the frames
 * after navigation, so scrolling at once would clamp short of `y`. Stops early if the reader scrolls first.
 */
export function restoreScroll(y: number, frames = 60): void {
	if (y <= 0) return;
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
