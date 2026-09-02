import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
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
	it('matches an institution anywhere in the account path, ignoring separators', () => {
		expect(accountVar('Liabilities:CC:AmexGold')).toBe('var(--inst-amex)');
		expect(accountVar('Assets:Cash:Ally')).toBe('var(--inst-ally)');
		expect(accountVar('Wealthfront')).toBe('var(--inst-wealthfront)');
	});

	it('prefers the longer brand when one fragment contains another', () => {
		// "charlesschwab" wins over "schwab"; both map to the same token, so assert the pair that
		// would actually collide: "bankofamerica" must not fall through to a shorter key.
		expect(accountVar('Assets:Cash:BankOfAmerica')).toBe('var(--inst-bofa)');
		expect(accountVar('Assets:Investments:Taxable:CharlesSchwabIndividual')).toBe(
			'var(--inst-schwab)'
		);
	});

	it('falls back to a neutral for an unmapped institution', () => {
		expect(accountVar('Assets:Cash:CreditUnion')).toBe('var(--inst-other)');
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
