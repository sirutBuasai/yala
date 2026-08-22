// Small pure formatting helpers shared across components and charts.

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

/** Display-name overrides for account leaves that plain de-CamelCasing gets wrong. */
const ACCOUNT_ALIASES_OVERRIDE: Record<string, string> = {
	BofACash: 'BofA Cash',
	BofA: 'BofA'
};

/** The leaf of an account path — the segment after the last ":", or the whole name if none. */
export function accountLeaf(name: string | null | undefined): string {
	return name ? (String(name).split(':').pop() ?? '') : '';
}

/** Format a funding account for display: the leaf name (after the last ":"), de-CamelCased, with alias overrides applied. */
export function formatAccount(name: string | null | undefined): string {
	if (!name) return '';

	const leaf = accountLeaf(name);

	if (ACCOUNT_ALIASES_OVERRIDE[leaf]) return ACCOUNT_ALIASES_OVERRIDE[leaf];

	return (
		leaf
			// space between a lowercase/digit and an uppercase
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			// split a run of caps before a capitalized word
			.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
			.trim()
	);
}

/** Format a "YYYY-MM" key as a full month label, e.g. "2025-01" → "Jan 2025". */
export function monthLabel(key: string): string {
	const [y, m] = key.split('-');

	return MONTHS[+m - 1] + ' ' + y;
}

/** Short month name for a "YYYY-MM" (or longer) key, e.g. "2026-07" → "Jul". */
export function monthName(key: string): string {
	return MONTHS[+key.slice(5, 7) - 1] ?? key;
}

/** Format a "YYYY-MM-DD" date as a compact "M/D", e.g. "2026-07-03" → "7/3". */
export function monthDay(date: string): string {
	const [, m, d] = date.split('-');

	return `${+m}/${+d}`;
}
