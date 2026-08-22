import { describe, expect, it } from 'vitest';
import { MONTHS, esc, formatAccount, money, moneyK, monthLabel, pct } from './format';

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

describe('formatAccount', () => {
	it('takes the leaf and de-CamelCases it', () => {
		expect(formatAccount('Liabilities:CC:AmexGold')).toBe('Amex Gold');
		expect(formatAccount('Assets:Cash:WFAutograph')).toBe('WF Autograph');
	});

	it('applies acronym overrides', () => {
		expect(formatAccount('Assets:Cash:BofACash')).toBe('BofA Cash');
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

	it('has twelve month abbreviations', () => {
		expect(MONTHS).toHaveLength(12);
	});
});
