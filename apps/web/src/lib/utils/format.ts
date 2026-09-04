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

/**
 * Money to the cent. For reconciliation figures the user has to match exactly — rounding an
 * expected balance to whole dollars makes a penny-perfect entry look wrong.
 */
export function moneyExact(n: number | null | undefined): string {
	const v = n || 0;
	const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

	return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, digits);
}

export function moneyK(n: number | null | undefined): string {
	n = n || 0;

	return (n < 0 ? '-$' : '$') + (Math.abs(n) / 1000).toFixed(Math.abs(n) < 10000 ? 1 : 0) + 'k';
}

/** Compact money for tight spaces: abbreviate thousands ($1.2k) but keep sub-$1k exact ($31). */
export function moneyCompact(n: number | null | undefined): string {
	return Math.abs(n || 0) >= 1000 ? moneyK(n) : money(n);
}

export function pct(part: number, whole: number): string {
	return whole ? ((part / whole) * 100).toFixed(0) + '%' : '—';
}

/** Escape a string for safe interpolation into HTML (tooltips, labels). */
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

/** The leaf of an account path — the segment after the last ":", or the whole name if none. */
export function accountLeaf(name: string | null | undefined): string {
	return name ? (String(name).split(':').pop() ?? '') : '';
}

/**
 * An account's display name, as the ledger resolved it.
 *
 * A lookup, not a computation. The name comes from `meta.accounts` in `data.json`, where Python has
 * already applied the naming rule — parse the CamelCase leaf, and if it overruns the 20-character
 * budget, substitute the `bank_alias` / `account_alias` the ledger declares. Deriving it here as
 * well would put the rule in two languages and let them drift.
 *
 * The fallback is the raw leaf rather than a second guess at formatting: the directory covers every
 * declared account, so a miss means the account was created after this document was loaded. Showing
 * the leaf makes that visible instead of papering over it with a name the ledger never agreed to.
 */
export function formatAccount(name: string | null | undefined): string {
	if (!name) return '';

	return accountInfo(name)?.name ?? accountLeaf(name);
}

/** Format a "YYYY-MM" key as a full month label. */
export function monthLabel(key: string): string {
	const [y, m] = key.split('-');
	if (!y || !m) return key;

	return (MONTHS[+m - 1] ?? key) + ' ' + y;
}

/** Short month name for a "YYYY-MM" (or longer) key. */
export function monthName(key: string): string {
	return MONTHS[+key.slice(5, 7) - 1] ?? key;
}

/** Format a "YYYY-MM-DD" date as a compact "M/D". */
export function monthDay(date: string): string {
	const [, m, d] = date.split('-');
	if (!m || !d) return date;

	return `${+m}/${+d}`;
}
