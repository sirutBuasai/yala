import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import {
	CATEGORY_TOKEN,
	INSTITUTION_TOKEN,
	accountVar,
	categoryVar,
	institutionSlug,
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

describe('institutionSlug', () => {
	it('strips case, spaces and punctuation', () => {
		expect(institutionSlug('Bank of Example')).toBe('bankofexample');
		expect(institutionSlug('E.G. Brokerage')).toBe('egbrokerage');
	});
});

describe('accountVar', () => {
	afterEach(() => setAccountDirectory({}));

	/** Any institution the palette knows, without naming a specific one in the test body. */
	const [aSlug, aToken] = Object.entries(INSTITUTION_TOKEN)[0]!;
	const [bSlug, bToken] = Object.entries(INSTITUTION_TOKEN)[1]!;

	it('every institution in the palette resolves to a token', () => {
		for (const [slug, token] of Object.entries(INSTITUTION_TOKEN)) {
			setAccountDirectory({ 'Assets:Cash:BankA': { name: 'Bank A', institution: slug } });
			expect(accountVar('Assets:Cash:BankA')).toBe(`var(--${token})`);
		}
	});

	it('colours by the declared institution, not by the account name', () => {
		// The account paths deliberately say nothing about who holds them — the dot colour comes
		// only from the declaration, so a name can't influence it.
		setAccountDirectory({
			'Assets:Cash:BankA': { name: 'Bank A', institution: aSlug },
			'Liabilities:CC:CardA': { name: 'Card A', institution: bSlug }
		});

		expect(accountVar('Assets:Cash:BankA')).toBe(`var(--${aToken})`);
		expect(accountVar('Liabilities:CC:CardA')).toBe(`var(--${bToken})`);
	});

	it('colours two accounts at one institution as one family', () => {
		setAccountDirectory({
			'Assets:Cash:BankA': { name: 'Bank A', institution: aSlug },
			'Liabilities:CC:CardA': { name: 'Card A', institution: aSlug }
		});

		expect(accountVar('Liabilities:CC:CardA')).toBe(accountVar('Assets:Cash:BankA'));
	});

	it('falls back to a neutral for an untagged account, an unknown institution, or nullish', () => {
		setAccountDirectory({
			// An employer — not held anywhere, so it has no institution at all.
			'Income:Salary:Employer1': { name: 'Employer 1' },
			'Assets:Cash:BankB': { name: 'Bank B', institution: 'Bank of Example' }
		});

		expect(accountVar('Income:Salary:Employer1')).toBe('var(--inst-other)');
		expect(accountVar('Assets:Cash:BankB')).toBe('var(--inst-other)');
		expect(accountVar('Assets:Cash:NotDeclared')).toBe('var(--inst-other)');
		expect(accountVar(null)).toBe('var(--inst-other)');
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
