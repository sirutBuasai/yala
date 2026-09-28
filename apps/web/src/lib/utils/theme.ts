// Theme state + the account and category colour lookups. Charts reference the CSS custom properties
// directly, so light/dark theming happens entirely in the `:root[data-theme]` swap and needs no JS palette.

import { writable } from 'svelte/store';
import { accountInfo, categoryInfo } from '$lib/data/directory.svelte';

type ThemeMode = 'dark' | 'light';

/** The colour for a spending category, from the user's settings. A category the API gave no colour to
    reads as lavender. Used as-is in BOTH themes. */
export function categoryVar(category: string): string {
	return categoryInfo(category)?.color ?? 'var(--lav)';
}

/** The colour for an account's dot: a lookup, not a palette. The user's settings declare the hex and
    the API resolves it per account. Used as-is in BOTH themes. */
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
