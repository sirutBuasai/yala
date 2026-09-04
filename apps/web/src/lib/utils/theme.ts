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
 * The colour for an account's dot, as a CSS value.
 *
 * There is no palette here any more, and no institution list: the ledger declares a hex per
 * institution (see `yala.ledger.institutions`) and the API resolves it per account, so adding an
 * institution or recolouring one is a ledger edit with no code change and no name matching.
 *
 * The declared colour is used as-is in both themes, so choosing one that reads on the cream surface
 * and the charcoal one alike is the chooser's call. The neutral swatch stands in for an account whose
 * institution has no colour on file.
 */
export function accountVar(account: string | null | undefined): string {
	return accountInfo(account)?.color ?? 'var(--inst-neutral)';
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
