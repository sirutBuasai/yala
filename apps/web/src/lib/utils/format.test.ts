import { afterEach, describe, expect, it } from 'vitest';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import {
	MONTHS,
	accountLeaf,
	esc,
	formatAccount,
	money,
	moneyCompact,
	moneyK,
	monthDay,
	monthLabel,
	monthName,
	pct
} from '$lib/utils/format';

describe('money', () => {
	it('rounds to whole dollars and adds thousands separators', () => {
		expect(money(1500)).toBe('$1,500');
		expect(money(1499.6)).toBe('$1,500');
		expect(money(1499.4)).toBe('$1,499');
	});

	it('formats negatives with a leading -$', () => {
		expect(money(-1500)).toBe('-$1,500');
	});

	it('treats null/undefined/NaN as $0', () => {
		expect(money(null)).toBe('$0');
		expect(money(undefined)).toBe('$0');
		expect(money(NaN)).toBe('$0');
	});

	it('does not render a negative zero', () => {
		// Math.round(-0.4) === -0, which must still print as "$0" not "-$0".
		expect(money(-0.4)).toBe('$0');
	});
});

describe('moneyK', () => {
	it('uses one decimal below 10k and none at/above 10k', () => {
		expect(moneyK(1700)).toBe('$1.7k');
		expect(moneyK(9999)).toBe('$10.0k');
		expect(moneyK(25000)).toBe('$25k');
	});

	it('handles negatives and nullish', () => {
		expect(moneyK(-2500)).toBe('-$2.5k');
		expect(moneyK(null)).toBe('$0.0k');
	});
});

describe('moneyCompact', () => {
	it('keeps sub-$1k amounts exact and abbreviates thousands', () => {
		expect(moneyCompact(31)).toBe('$31');
		expect(moneyCompact(999)).toBe('$999');
		expect(moneyCompact(1000)).toBe('$1.0k');
		expect(moneyCompact(3511)).toBe('$3.5k');
	});

	it('handles negatives and nullish', () => {
		expect(moneyCompact(-1675)).toBe('-$1.7k');
		expect(moneyCompact(null)).toBe('$0');
	});
});

describe('pct', () => {
	it('returns an integer percentage', () => {
		expect(pct(25, 100)).toBe('25%');
		expect(pct(1, 3)).toBe('33%');
	});

	it('guards divide-by-zero with an em dash', () => {
		expect(pct(5, 0)).toBe('—');
	});
});

describe('esc', () => {
	it('escapes HTML metacharacters', () => {
		expect(esc('<b>"x"&\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
	});

	it('renders null/undefined as empty string', () => {
		expect(esc(null)).toBe('');
		expect(esc(undefined)).toBe('');
	});
});

describe('accountLeaf', () => {
	it('returns the segment after the last colon, or the whole name if none', () => {
		expect(accountLeaf('Liabilities:CC:Card1')).toBe('Card1');
		expect(accountLeaf('Cash')).toBe('Cash');
		expect(accountLeaf(null)).toBe('');
		expect(accountLeaf(undefined)).toBe('');
	});
});

describe('formatAccount', () => {
	afterEach(() => setAccountDirectory({}));

	it('reads the name the ledger resolved, rather than deriving one', () => {
		setAccountDirectory({
			'Liabilities:CC:BankOfExampleCashRewards': {
				name: 'BoE Cash Rewards',
				institution: 'Bank of Example'
			},
			'Assets:Cash:BankOfExample': { name: 'Bank of Example', institution: 'Bank of Example' }
		});

		// Neither of these is derivable from the path here: one is shortened by a declared alias, the
		// other needs a lowercase particle that de-CamelCasing alone would capitalize.
		expect(formatAccount('Liabilities:CC:BankOfExampleCashRewards')).toBe('BoE Cash Rewards');
		expect(formatAccount('Assets:Cash:BankOfExample')).toBe('Bank of Example');
	});

	it('falls back to the raw leaf for an account the directory has never heard of', () => {
		// Deliberately not a second formatting rule: a miss means the account was opened after this
		// document loaded, and showing the leaf makes that visible instead of inventing a name.
		expect(formatAccount('Assets:Cash:Bank1Checking')).toBe('Bank1Checking');
	});

	it('returns empty string for nullish', () => {
		expect(formatAccount(null)).toBe('');
		expect(formatAccount(undefined)).toBe('');
	});
});

describe('month labels', () => {
	it('formats a YYYY-MM key', () => {
		expect(monthLabel('2025-01')).toBe('Jan 2025');
	});

	it('gives the short month name for a key', () => {
		expect(monthName('2026-07')).toBe('Jul');
		expect(monthName('2026-12')).toBe('Dec');
	});

	it('formats a YYYY-MM-DD date as M/D', () => {
		expect(monthDay('2026-07-03')).toBe('7/3');
		expect(monthDay('2026-12-25')).toBe('12/25');
	});

	it('has twelve month abbreviations', () => {
		expect(MONTHS).toHaveLength(12);
	});
});
