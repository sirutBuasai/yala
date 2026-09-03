// Theme state + the per-category accent map. Charts render SVG with CSS custom
// properties directly (fill="var(--lav)"), so light/dark theming happens purely
// via the :root[data-theme] swap in app.css — no JS palette object needed.

import { writable } from 'svelte/store';
import { accountInfo } from '$lib/data/directory.svelte';

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
 * Institution accents, keyed by the `institution:` the ledger declares, slugified.
 *
 * Keyed by the declaration rather than by matching the account name, which is a correctness fix
 * rather than a tidy-up. Matching is wrong in four common shapes: an employer-sponsored plan named
 * for the employer but held at a custodian, a co-brand card whose name contains *two* institutions,
 * a card issued by one bank and branded by another, and a salary account whose employer shares a
 * name with an institution. Longest-substring matching resolved those by accident of key length —
 * and when two candidate names are the same length, by coin toss.
 *
 * Adding an institution means one line here plus one `--inst-*` token in app.css. That stays in code
 * on purpose: which colour a brand gets is a design decision, unlike what an account is called.
 */
export const INSTITUTION_TOKEN: Record<string, string> = {
	americanexpress: 'inst-amex',
	charlesschwab: 'inst-schwab',
	venmo: 'inst-venmo',
	wealthfront: 'inst-wealthfront',
	ally: 'inst-ally',
	bankofamerica: 'inst-bofa',
	usbank: 'inst-usbank',
	capitalone: 'inst-capitalone',
	discover: 'inst-discover',
	wellsfargo: 'inst-wellsfargo',
	amazon: 'inst-amazon',
	fidelity: 'inst-fidelity',
	tdbank: 'inst-tdbank',
	chase: 'inst-chase',
	bilt: 'inst-bilt'
};

/** An institution name as a palette key: lowercase, punctuation and spaces removed. */
export function institutionSlug(institution: string): string {
	return institution.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * CSS variable reference for an account's institution color, for the dot beside an account name.
 * Falls back to a neutral so an account with no declared institution — or one whose institution
 * has no token yet — still reads as "an account" rather than vanishing.
 */
export function accountVar(account: string | null | undefined): string {
	const institution = accountInfo(account)?.institution;
	const token = institution ? INSTITUTION_TOKEN[institutionSlug(institution)] : undefined;

	return `var(--${token ?? 'inst-other'})`;
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
