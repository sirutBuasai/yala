import { afterEach, describe, expect, it } from 'vitest';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import {
	MONTHS,
	accountLeaf,
	dateShort,
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
		// Math.round(-0.4) is -0, which must still print as "$0".
		expect(money(-0.4)).toBe('$0');
	});
});

describe('moneyK', () => {
	it('uses one decimal below 10k and none at/above 10k', () => {
		expect(moneyK(1700)).toBe('$1.7k');
		expect(moneyK(9999)).toBe('$10.0k');
		expect(moneyK(25000)).toBe('$25k');
	});

	// A projection compounds into the millions, and one tier alone rendered its axis "$50000k".
	it('steps up to millions rather than counting thousands past a thousand', () => {
		expect(moneyK(1_000_000)).toBe('$1.0M');
		expect(moneyK(9_900_000)).toBe('$9.9M');
		expect(moneyK(50_000_000)).toBe('$50M');
		expect(moneyK(999_999)).toBe('$1000k');
	});

	it('handles negatives and nullish', () => {
		expect(moneyK(-2500)).toBe('-$2.5k');
		expect(moneyK(-3_400_000)).toBe('-$3.4M');
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
			'Liabilities:CC:CardA': {
				name: 'BoE Cash Rewards',
				institution_name: 'Bank of Example'
			},
			'Assets:Cash:BankA': { name: 'Bank of Example', institution_name: 'Bank of Example' }
		});

		// Neither name is derivable from its path.
		expect(formatAccount('Liabilities:CC:CardA')).toBe('BoE Cash Rewards');
		expect(formatAccount('Assets:Cash:BankA')).toBe('Bank of Example');
	});

	it('falls back to the raw leaf for an account the directory has never heard of', () => {
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

	it('formats a YYYY-MM-DD date as month and day, without the leading zero', () => {
		expect(dateShort('2026-08-01')).toBe('Aug 1');
		expect(dateShort('2026-08-26')).toBe('Aug 26');
	});

	it('keeps two dates in one month apart, which is why the day is there at all', () => {
		expect(dateShort('2026-08-01')).not.toBe(dateShort('2026-08-26'));
	});

	it('returns an unparseable date as it came', () => {
		expect(dateShort('2026')).toBe('2026');
	});
});
