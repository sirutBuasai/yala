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

/** Compact money for dense cells/labels. */
export function compact(n: number | null | undefined): string {
	const v = Math.round(n || 0);
	if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';

	return String(v);
}

/** Display-name overrides for account leaves that plain de-CamelCasing gets wrong. */
const ACCOUNT_ALIASES_OVERRIDE: Record<string, string> = {
	BofACash: 'BofA Cash',
	BofA: 'BofA'
};

/** Format a funding account for display: the leaf name (after the last ":"), de-CamelCased, with alias overrides applied. */
export function formatAccount(name: string | null | undefined): string {
	if (!name) return '';

	const leaf = String(name).split(':').pop() ?? '';

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

/** Format a "YYYY-MM" key as a full month label. */
export function monthLabel(key: string): string {
	const [y, m] = key.split('-');

	return MONTHS[+m - 1] + ' ' + y;
}

/** Format a "YYYY-MM" key as a short month label with a 2-digit year. */
export function monthShort(key: string): string {
	const [y, m] = key.split('-');

	return MONTHS[+m - 1] + ' ' + y.slice(2);
}
