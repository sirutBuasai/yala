// Small pure formatting helpers shared across components and charts.

import { accountInfo } from '$lib/data/directory.svelte';

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

export function pct(part: number, whole: number): string {
	return whole ? ((part / whole) * 100).toFixed(0) + '%' : '—';
}

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

/**
 * An account's display name — a LOOKUP, not a computation: the API has already applied the naming
 * rule, and deriving it here too would put that rule in two languages. The fallback is the raw leaf,
 * so an account created after this document loaded reads as unresolved rather than as renamed.
 */
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
	return MONTHS[+key.slice(5, 7) - 1] ?? key;
}

/** An inclusive year range, or `empty` when there are no years. */
export function yearSpan(years: number[], empty = ''): string {
	return years.length ? `${years[0]}–${years[years.length - 1]}` : empty;
}

/** A "YYYY-MM-DD" date as a compact "M/D". */
export function monthDay(date: string): string {
	const [, m, d] = date.split('-');
	if (!m || !d) return date;

	return `${+m}/${+d}`;
}
