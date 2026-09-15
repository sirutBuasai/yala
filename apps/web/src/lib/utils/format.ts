// Small pure formatting helpers shared across components and charts.

import { NO_VALUE } from '$lib/copy';
import { accountInfo } from '$lib/data/directory.svelte';
import { monthOf } from '$lib/utils/period';

export const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

export function money(n: number | null | undefined): string {
	const r = Math.round(n || 0);

	return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString();
}

/** Money to the cent, for reconciliation figures the user has to match exactly. */
export function moneyExact(n: number | null | undefined): string {
	const v = n || 0;
	const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

	return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, digits);
}

export function moneyK(n: number | null | undefined): string {
	n = n || 0;

	return (n < 0 ? '-$' : '$') + (Math.abs(n) / 1000).toFixed(Math.abs(n) < 10000 ? 1 : 0) + 'k';
}

/** Compact money for tight spaces: abbreviate thousands, keep smaller figures exact. */
export function moneyCompact(n: number | null | undefined): string {
	return Math.abs(n || 0) >= 1000 ? moneyK(n) : money(n);
}

/** The same abbreviation without the currency, for a grid of figures where a symbol per cell is noise
    and the unit is already stated once. Rounds — pair it with `moneyExact` wherever the reader can ask
    for the figure itself. */
export function numCompact(n: number | null | undefined): string {
	const v = n || 0;
	return Math.abs(v) >= 1000
		? (v / 1000).toFixed(Math.abs(v) < 10000 ? 1 : 0) + 'k'
		: String(Math.round(v));
}

export function pct(part: number, whole: number): string {
	return whole ? ((part / whole) * 100).toFixed(0) + '%' : NO_VALUE;
}

/** First letter upper-cased, the rest left alone: a field's noun used to open a sentence. */
export const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Escape a string for safe interpolation into HTML. */
export function esc(s: unknown): string {
	return String(s == null ? '' : s).replace(
		/[&<>"']/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			})[c] as string
	);
}

/** The segment after the last ":", or the whole name if there is none. */
export function accountLeaf(name: string | null | undefined): string {
	return name ? (String(name).split(':').pop() ?? '') : '';
}

/** An account's display name. A lookup, not a computation: the API has applied the naming rule, and
    deriving it here would put that rule in two languages. Falls back to the raw leaf. */
export function formatAccount(name: string | null | undefined): string {
	if (!name) return '';

	return accountInfo(name)?.name ?? accountLeaf(name);
}

export function monthLabel(key: string): string {
	const [y, m] = key.split('-');
	if (!y || !m) return key;

	return (MONTHS[+m - 1] ?? key) + ' ' + y;
}

/** Short month name for a "YYYY-MM" (or longer) key. */
export function monthName(key: string): string {
	return MONTHS[monthOf(key) - 1] ?? key;
}

/** An inclusive year range, or `empty` when there are no years. */
export function yearSpan(years: number[], empty = ''): string {
	return years.length ? `${years[0]}–${years[years.length - 1]}` : empty;
}

/** A "YYYY-MM-DD" date as it reads in prose: "Jan 15, 2025". Unparseable input is returned as it
    came, since a date the app cannot read is still better shown than swallowed. */
export function dateLong(date: string | null | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');

	return m ? `${MONTHS[+m[2]! - 1]} ${+m[3]!}, ${m[1]}` : (date ?? '');
}

/** A "YYYY-MM-DD" date as a compact "M/D". */
export function monthDay(date: string): string {
	const [, m, d] = date.split('-');
	if (!m || !d) return date;

	return `${+m}/${+d}`;
}
