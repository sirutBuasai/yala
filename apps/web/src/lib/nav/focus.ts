// Page state in the URL (docs/redesign D4, D9). The focus month is shared by every page; year-level views
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

/**
 * `href` as that page was `left` (its query when you last saw it), moved to the current URL's focus month,
 * so moving between pages keeps both your place and each page's picks (D21).
 */
export function withFocus(href: string, url: URL, left = ''): string {
	const next = new URLSearchParams(left);
	const month = validMonth(url);
	// No focus here means the latest month, which an older remembered month would contradict.
	if (month) next.set(MONTH_PARAM, month);
	else next.delete(MONTH_PARAM);
	const query = next.toString();
	return query ? `${href}?${query}` : href;
}

/** `url`'s path and query with `patch` applied: a string sets a parameter, null removes it. */
export function withParams(url: URL, patch: Record<string, string | null>): string {
	const next = new URLSearchParams(url.searchParams);
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) next.delete(key);
		else next.set(key, value);
	}
	const query = next.toString();
	return query ? `${url.pathname}?${query}` : url.pathname;
}
