// Where each page was left in this tab, so reopening it from the sidebar restores its picks and its scroll
// (D21). Session storage rather than local: it is about this visit, not a preference, and a reload clears
// it (D26).

const KEY = 'yala-page-state';

interface Left {
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

function write(pathname: string, patch: Partial<Left>): void {
	try {
		const all = read();
		all[pathname] = { search: '', scroll: 0, ...all[pathname], ...patch };
		sessionStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// Storage refused: pages open fresh, which is the old behaviour.
	}
}

export const remember = (url: URL) => write(url.pathname, { search: url.search });

/** Forget every page, so each opens at its defaults. */
export function forgetPages(): void {
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// Nothing was stored.
	}
}
export const rememberScroll = (pathname: string, scroll: number) => write(pathname, { scroll });

/** The query `pathname` was last left with, or nothing. */
export const leftAt = (pathname: string): string => read()[pathname]?.search ?? '';

/** How far down, in CSS pixels, `pathname` was last left. */
export const scrollAt = (pathname: string): number => read()[pathname]?.scroll ?? 0;

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
