import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import { accountVar, categoryVar, setTheme, theme, toggleTheme } from '$lib/utils/theme';

describe('categoryVar', () => {
	afterEach(() => setAccountDirectory({}));

	it('uses the colour the settings give the category account', () => {
		setAccountDirectory({
			'Expenses:Grocery': { name: 'Grocery', kind: 'category', color: '#f295c5' }
		});

		expect(categoryVar('Grocery')).toBe('#f295c5');
	});

	it('falls back to lavender for a category with no colour', () => {
		expect(categoryVar('Nonsense')).toBe('var(--lav)');
	});
});

describe('accountVar', () => {
	afterEach(() => setAccountDirectory({}));

	it('uses the colour the ledger declared, as-is', () => {
		setAccountDirectory({
			'Assets:Cash:BankA': { name: 'Bank A', institution_name: 'Bank of Example', color: '#de85c8' }
		});

		expect(accountVar('Assets:Cash:BankA')).toBe('#de85c8');
	});

	it('colours by the declaration, not by the account name', () => {
		// The paths are deliberately misleading about who holds each account.
		setAccountDirectory({
			'Assets:Cash:CardB': {
				name: 'Bank A',
				institution_name: 'Bank of Example',
				color: '#4a6f9e'
			},
			'Liabilities:CC:BankB': { name: 'Card A', institution_name: 'Card Issuer', color: '#d94c4c' }
		});

		expect(accountVar('Assets:Cash:CardB')).toBe('#4a6f9e');
		expect(accountVar('Liabilities:CC:BankB')).toBe('#d94c4c');
	});

	it('colours two accounts at one institution as one family', () => {
		setAccountDirectory({
			'Assets:Cash:BankA': {
				name: 'Bank A',
				institution_name: 'Bank of Example',
				color: '#639cc3'
			},
			'Liabilities:CC:CardA': {
				name: 'Card A',
				institution_name: 'Bank of Example',
				color: '#639cc3'
			}
		});

		expect(accountVar('Liabilities:CC:CardA')).toBe(accountVar('Assets:Cash:BankA'));
	});

	it('falls back to the neutral swatch when no colour was declared', () => {
		setAccountDirectory({
			// An employer is not held anywhere, so it has no institution and no colour.
			'Income:Salary:Employer1': { name: 'Employer 1' },
			// An institution with no colour declared in the ledger yet.
			'Assets:Cash:BankB': { name: 'Bank B', institution_name: 'Second Example Bank' }
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
