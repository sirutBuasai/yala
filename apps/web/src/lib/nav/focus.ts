// Page state in the URL (docs/redesign D9, D33). Each view keeps its own focus month; year-level views
// read their year from it, so one parameter carries both grains.

export const MONTH_PARAM = 'month';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

const validMonth = (url: URL) => {
	const month = url.searchParams.get(MONTH_PARAM);
	return month && MONTH_KEY.test(month) ? month : null;
};

/** The focus month in `url`, or `fallback` when it has none or names no real month. */
export function focusMonth(url: URL, fallback: string): string {
	return validMonth(url) ?? fallback;
}

/** `url`'s path and query with `patch` applied: a string sets a parameter, null removes it. */
export function withParams(url: URL, patch: Record<string, string | null>): string {
	const { pathname } = url;
	const next = new URLSearchParams(url.searchParams);
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) next.delete(key);
		else next.set(key, value);
	}
	const query = next.toString();
	return query ? `${pathname}?${query}` : pathname;
}
