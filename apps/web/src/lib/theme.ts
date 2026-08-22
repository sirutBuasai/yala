// Theme state + the per-category accent map. Charts render SVG with CSS custom
// properties directly (fill="var(--lav)"), so light/dark theming happens purely
// via the :root[data-theme] swap in app.css — no JS palette object needed.

import { writable } from 'svelte/store';

export type ThemeMode = 'dark' | 'light';

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
	Other: 'cat-other'
};

/** CSS variable reference for a category's accent color. */
export function categoryVar(category: string): string {
	return `var(--${CATEGORY_TOKEN[category] ?? 'lav'})`;
}

function initialMode(): ThemeMode {
	if (typeof document !== 'undefined') {
		const attr = document.documentElement.getAttribute('data-theme');

		if (attr === 'light' || attr === 'dark') return attr;
	}

	return 'light';
}

export const theme = writable<ThemeMode>(initialMode());

export function setTheme(mode: ThemeMode): void {
	document.documentElement.setAttribute('data-theme', mode);

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
