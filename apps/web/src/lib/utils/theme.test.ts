import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import {
	CATEGORY_TOKEN,
	accountVar,
	categoryVar,
	setTheme,
	theme,
	toggleTheme
} from '$lib/utils/theme';

describe('categoryVar', () => {
	it('maps known categories to their token', () => {
		expect(categoryVar('Grocery')).toBe('var(--cat-grocery)');
		expect(categoryVar('Takeouts')).toBe('var(--cat-takeouts)');
	});

	it('falls back to lavender for unknown categories', () => {
		expect(categoryVar('Nonsense')).toBe('var(--lav)');
	});

	it('has a Misc token', () => {
		expect(CATEGORY_TOKEN.Misc).toBe('cat-misc');
	});
});

describe('accountVar', () => {
	afterEach(() => setAccountDirectory({}));

	it('uses the colour the ledger declared, as-is', () => {
		setAccountDirectory({
			'Assets:Cash:BankA': { name: 'Bank A', institution: 'Bank of Example', color: '#de85c8' }
		});

		expect(accountVar('Assets:Cash:BankA')).toBe('#de85c8');
	});

	it('colours by the declaration, not by the account name', () => {
		// The paths deliberately say nothing about who holds them, and the colours are swapped
		// relative to what a name-matching scheme would guess.
		setAccountDirectory({
			'Assets:Cash:CardishName': {
				name: 'Bank A',
				institution: 'Bank of Example',
				color: '#4a6f9e'
			},
			'Liabilities:CC:BankishName': { name: 'Card A', institution: 'Card Issuer', color: '#d94c4c' }
		});

		expect(accountVar('Assets:Cash:CardishName')).toBe('#4a6f9e');
		expect(accountVar('Liabilities:CC:BankishName')).toBe('#d94c4c');
	});

	it('colours two accounts at one institution as one family', () => {
		setAccountDirectory({
			'Assets:Cash:BankA': { name: 'Bank A', institution: 'Bank of Example', color: '#639cc3' },
			'Liabilities:CC:CardA': { name: 'Card A', institution: 'Bank of Example', color: '#639cc3' }
		});

		expect(accountVar('Liabilities:CC:CardA')).toBe(accountVar('Assets:Cash:BankA'));
	});

	it('falls back to the neutral swatch when no colour was declared', () => {
		setAccountDirectory({
			// An employer — not held anywhere, so it has no institution and no colour.
			'Income:Salary:Employer1': { name: 'Employer 1' },
			// An institution with no directive in the ledger yet.
			'Assets:Cash:BankB': { name: 'Bank B', institution: 'Second Example Bank' }
		});

		expect(accountVar('Income:Salary:Employer1')).toBe('var(--inst-neutral)');
		expect(accountVar('Assets:Cash:BankB')).toBe('var(--inst-neutral)');
		expect(accountVar('Assets:Cash:NotDeclared')).toBe('var(--inst-neutral)');
		expect(accountVar(null)).toBe('var(--inst-neutral)');
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
