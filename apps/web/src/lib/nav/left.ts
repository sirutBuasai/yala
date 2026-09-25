// Where each page was left in this tab, so reopening it from the sidebar restores its picks (D21). Session
// storage rather than local: it is about this visit, not a preference, and it still survives a reload.

const KEY = 'yala-page-state';

function read(): Record<string, string> {
	try {
		return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
	} catch {
		return {};
	}
}

export function remember(url: URL): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [url.pathname]: url.search }));
	} catch {
		// Storage refused: pages open fresh, which is the old behaviour.
	}
}

/** The query `pathname` was last left with, or nothing. */
export function leftAt(pathname: string): string {
	return read()[pathname] ?? '';
}
