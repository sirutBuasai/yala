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

/** Exact cents without the currency, for a field that already shows the symbol itself. */
export function amountExact(n: number | null | undefined): string {
	const v = n || 0;
	const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

	return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString(undefined, digits);
}

/** Money to the cent, for reconciliation figures the user has to match exactly. */
export function moneyExact(n: number | null | undefined): string {
	const v = n || 0;

	return (v < 0 ? '-$' : '$') + amountExact(Math.abs(v));
}

/**
 * An unsigned magnitude abbreviated to its tier: thousands as `k`, millions as `M`, one decimal until the
 * tier's tens so a label is never more than four digits wide. Both tiers, because a projection compounds
 * past a million and `k` alone left the axis unreadable.
 */
function tiered(magnitude: number): string {
	return magnitude >= 1e6
		? (magnitude / 1e6).toFixed(magnitude < 1e7 ? 1 : 0) + 'M'
		: (magnitude / 1e3).toFixed(magnitude < 1e4 ? 1 : 0) + 'k';
}

export function moneyK(n: number | null | undefined): string {
	n = n || 0;
	return (n < 0 ? '-$' : '$') + tiered(Math.abs(n));
}

/** Compact money for tight spaces: abbreviate thousands, keep smaller figures exact. */
export function moneyCompact(n: number | null | undefined): string {
	return Math.abs(n || 0) >= 1000 ? moneyK(n) : money(n);
}

/** The same abbreviation without the currency, for a grid where a symbol per cell is noise and the unit is
    stated once. Rounds, so pair it with `moneyExact` wherever the reader can ask for the figure. */
export function numCompact(n: number | null | undefined): string {
	const v = n || 0;
	return Math.abs(v) >= 1000 ? (v < 0 ? '-' : '') + tiered(Math.abs(v)) : String(Math.round(v));
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
    deriving it here would put that rule in two languages. */
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

/** An ISO date as it reads in prose. Unparseable input is returned as it came: a date the app cannot read
    is still better shown than swallowed. */
export function dateLong(date: string | null | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');

	return m ? `${MONTHS[+m[2]! - 1]} ${+m[3]!}, ${m[1]}` : (date ?? '');
}

/** A "YYYY-MM-DD" date as "Mon D", for a view that already states which year it is showing. */
export function dateShort(date: string): string {
	const [, m, d] = date.split('-');
	if (!m || !d) return date;

	return `${MONTHS[+m - 1] ?? m} ${+d}`;
}

/** A "YYYY-MM-DD" date as a compact "M/D". */
export function monthDay(date: string): string {
	const [, m, d] = date.split('-');
	if (!m || !d) return date;

	return `${+m}/${+d}`;
}
