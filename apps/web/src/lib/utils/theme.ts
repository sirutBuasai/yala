// Theme state + the per-category accent map. Charts render SVG with CSS custom
// properties directly (fill="var(--lav)"), so light/dark theming happens purely
// via the :root[data-theme] swap in app.css — no JS palette object needed.

import { writable } from 'svelte/store';

type ThemeMode = 'dark' | 'light';

/**
 * Per-category accent map. Values are CSS token suffixes (fallback lavender),
 * consumed as `--<token>` custom properties for SVG chart fills and HTML dots.
 */
export const CATEGORY_TOKEN: Record<string, string> = {
	Housing: 'cat-housing',
	Grocery: 'cat-grocery',
	Takeouts: 'cat-takeouts',
	Travel: 'cat-travel',
	Utilities: 'cat-utilities',
	Transport: 'cat-transport',
	Personal: 'cat-personal',
	Health: 'cat-health',
	Recreation: 'cat-recreation',
	Subscription: 'cat-subscription',
	Misc: 'cat-misc'
};

/** CSS variable reference for a category's accent color. */
export function categoryVar(category: string): string {
	return `var(--${CATEGORY_TOKEN[category] ?? 'lav'})`;
}

/**
 * Institution accents, keyed by a lowercase fragment matched against the account name — so
 * `Liabilities:CC:AmexGold`, `Assets:Cash:Amex` and `Amex Gold` all resolve to the same hue.
 * Longer keys are matched first, letting a specific brand win over a shorter substring.
 */
const INSTITUTION_TOKEN: Record<string, string> = {
	amex: 'inst-amex',
	americanexpress: 'inst-amex',
	chase: 'inst-chase',
	sapphire: 'inst-chase',
	bofa: 'inst-bofa',
	bankofamerica: 'inst-bofa',
	citi: 'inst-citi',
	wellsfargo: 'inst-wellsfargo',
	// Card names are often abbreviated in a ledger path ("WFAutograph", "C1VentureX"), so the
	// abbreviation is mapped alongside the full brand. Short keys are safe because the list is
	// matched longest-first — "capitalone" wins over "c1" whenever both would hit.
	wf: 'inst-wellsfargo',
	c1: 'inst-capitalone',
	usbank: 'inst-usbank',
	ally: 'inst-ally',
	marcus: 'inst-marcus',
	discover: 'inst-discover',
	capitalone: 'inst-capitalone',
	schwab: 'inst-schwab',
	charlesschwab: 'inst-schwab',
	fidelity: 'inst-fidelity',
	vanguard: 'inst-vanguard',
	wealthfront: 'inst-wealthfront',
	robinhood: 'inst-robinhood',
	venmo: 'inst-venmo',
	paypal: 'inst-paypal',
	sofi: 'inst-sofi'
};

// Longest-first so "charlesschwab" and "bankofamerica" beat the shorter fragments they contain.
const INSTITUTION_KEYS = Object.keys(INSTITUTION_TOKEN).sort((a, b) => b.length - a.length);

/**
 * CSS variable reference for an account's institution color, for the dot beside an account name.
 * Falls back to a neutral so an unmapped institution still reads as "an account".
 */
export function accountVar(account: string | null | undefined): string {
	const hay = (account ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
	const hit = INSTITUTION_KEYS.find((k) => hay.includes(k));
	return `var(--${hit ? INSTITUTION_TOKEN[hit] : 'inst-other'})`;
}

function initialMode(): ThemeMode {
	if (typeof document !== 'undefined') {
		const attr = document.documentElement.getAttribute('data-theme');

		if (attr === 'light' || attr === 'dark') return attr;
	}

	return 'light';
}

export const theme = writable<ThemeMode>(initialMode());

const THEME_COLOR: Record<ThemeMode, string> = { light: '#f0ebdd', dark: '#16161f' };

export function setTheme(mode: ThemeMode): void {
	document.documentElement.setAttribute('data-theme', mode);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);

	try {
		localStorage.setItem('yala-theme', mode);
	} catch {
		/* storage unavailable — theme just won't persist */
	}

	theme.set(mode);
}

export function toggleTheme(): void {
	const current =
		document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

	setTheme(current === 'light' ? 'dark' : 'light');
}
