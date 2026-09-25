// The focus month, shared by every page through the URL (docs/redesign D4, D9). Year-level views read
// their year from it, so one parameter carries both grains.

export const MONTH_PARAM = 'month';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `href` carrying the current URL's focus month, so moving between pages keeps your place. */
export function withFocus(href: string, url: URL): string {
	const month = url.searchParams.get(MONTH_PARAM);
	if (!month || !MONTH_KEY.test(month)) return href;
	return `${href}?${new URLSearchParams({ [MONTH_PARAM]: month })}`;
}
