// Small pure formatting helpers shared across components and charts.

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

/** The sign goes ahead of any currency symbol. `value` must be the caller's rounded figure, or a magnitude
    that rounds to zero prints a minus. */
function withSign(value: number, magnitude: string, prefix = ''): string {
	return (value < 0 ? '-' : '') + prefix + magnitude;
}

const CENTS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const cents = (magnitude: number): string => magnitude.toLocaleString(undefined, CENTS);

export function money(n: number | null | undefined): string {
	const r = Math.round(n || 0);

	return withSign(r, Math.abs(r).toLocaleString(), '$');
}

/** Exact cents without the currency, for a field that already shows the symbol itself. */
export function amountExact(n: number | null | undefined): string {
	const v = n || 0;

	return withSign(v, cents(Math.abs(v)));
}

/** Whole dollars without the currency. */
export function amountWhole(n: number | null | undefined): string {
	const r = Math.round(n || 0);

	return withSign(r, Math.abs(r).toLocaleString());
}

/** Money to the cent, for reconciliation figures the user has to match exactly. */
export function moneyExact(n: number | null | undefined): string {
	const v = n || 0;

	return withSign(v, cents(Math.abs(v)), '$');
}

/** The tiers a magnitude abbreviates to, largest first. */
const TIERS: [number, string][] = [
	[1e9, 'B'],
	[1e6, 'M'],
	[1e3, 'k']
];

/** Abbreviated to `k`, `M` or `B`, at most four digits wide; projections compound past a million. */
function tiered(magnitude: number): string {
	const read = (tier: number) => {
		const [size, suffix] = TIERS[tier]!;
		const value = magnitude / size;
		return value.toFixed(value < 10 ? 1 : 0) + suffix;
	};
	let tier = TIERS.findIndex(([size]) => magnitude >= size);
	if (tier === -1) tier = TIERS.length - 1;
	// A figure that rounds up to a thousand of its tier reads in the next one: $1.0M, never $1000k.
	return tier > 0 && parseFloat(read(tier)) >= 1000 ? read(tier - 1) : read(tier);
}

export function moneyK(n: number | null | undefined): string {
	const v = n || 0;

	return withSign(v, tiered(Math.abs(v)), '$');
}

/** Compact money for tight spaces: abbreviate thousands, keep smaller figures exact. */
export function moneyCompact(n: number | null | undefined): string {
	return Math.abs(n || 0) >= 1000 ? moneyK(n) : money(n);
}

/** The same abbreviation without the currency, for a grid where a symbol per cell is noise and the unit is
    stated once. Rounds, so pair it with `moneyExact` wherever the reader can ask for the figure. */
export function numCompact(n: number | null | undefined): string {
	const v = n || 0;

	return Math.abs(v) >= 1000 ? withSign(v, tiered(Math.abs(v))) : String(Math.round(v));
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

/** A day of the month as it reads in prose: 1st, 2nd, 3rd, 11th, 24th. */
export function ordinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
	return `${n}${suffix}`;
}
