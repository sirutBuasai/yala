// Theme state + the per-category accent map. Charts reference the CSS custom properties directly, so
// light/dark theming happens entirely in the `:root[data-theme]` swap and needs no JS palette.

import { writable } from 'svelte/store';
import { accountInfo } from '$lib/data/directory.svelte';

type ThemeMode = 'dark' | 'light';

/** Values are CSS token suffixes, consumed as `--<token>` custom properties. */
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

export function categoryVar(category: string): string {
	return `var(--${CATEGORY_TOKEN[category] ?? 'lav'})`;
}

/**
 * The colour for an account's dot. Deliberately not a palette or an institution list here: the ledger
 * declares a hex per institution and the API resolves it per account, so recolouring is a ledger edit.
 * The declared colour is used as-is in BOTH themes; the neutral swatch stands in when none is on file.
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
