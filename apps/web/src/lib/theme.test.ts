import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { CATEGORY_TOKEN, categoryVar, setTheme, theme, toggleTheme } from './theme';

describe('categoryVar', () => {
	it('maps known categories to their token', () => {
		expect(categoryVar('Grocery')).toBe('var(--cat-grocery)');
		expect(categoryVar('Takeouts')).toBe('var(--cat-takeouts)');
	});

	it('falls back to lavender for unknown categories', () => {
		expect(categoryVar('Nonsense')).toBe('var(--lav)');
	});

	it('has an Other token', () => {
		expect(CATEGORY_TOKEN.Other).toBe('cat-other');
	});
});

describe('theme toggle', () => {
	beforeEach(() => {
		document.documentElement.removeAttribute('data-theme');
	});

	it('setTheme writes the attribute and the store (persistence is best-effort)', () => {
		// localStorage is absent in this jsdom setup; setTheme tolerates that by design.
		setTheme('light');
		expect(document.documentElement.getAttribute('data-theme')).toBe('light');
		expect(get(theme)).toBe('light');
	});

	it('toggles from the default dark to light and back', () => {
		toggleTheme(); // no attribute set -> treated as dark -> becomes light
		expect(document.documentElement.getAttribute('data-theme')).toBe('light');
		toggleTheme();
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});
});
