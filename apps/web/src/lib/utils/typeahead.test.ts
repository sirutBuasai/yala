import { describe, expect, it } from 'vitest';
import { isTypeKey, matchIndex, Typeahead } from '$lib/utils/typeahead';

const labels = ['Cash', 'Checking', 'credit card', 'Savings'];

describe('matchIndex', () => {
	it('matches a label prefix regardless of case', () => {
		expect(matchIndex(labels, 'SAV', 0)).toBe(3);
		expect(matchIndex(labels, 'cr', 0)).toBe(2);
	});

	it('keeps the active option while a longer query still matches it', () => {
		expect(matchIndex(labels, 'ch', 1)).toBe(1);
	});

	it('cycles through options sharing a repeated first letter, wrapping', () => {
		expect(matchIndex(labels, 'c', 0)).toBe(1);
		expect(matchIndex(labels, 'cc', 1)).toBe(2);
		expect(matchIndex(labels, 'ccc', 2)).toBe(0);
	});

	it('searches from the top when nothing is active', () => {
		expect(matchIndex(labels, 'c', -1)).toBe(0);
	});

	it('returns -1 when nothing matches', () => {
		expect(matchIndex(labels, 'z', 0)).toBe(-1);
		expect(matchIndex([], 'a', -1)).toBe(-1);
	});
});

describe('Typeahead', () => {
	it('builds one query from quick keystrokes', () => {
		const t = new Typeahead();
		expect(t.type('c', labels, -1, 0)).toBe(0);
		expect(t.type('r', labels, 0, 100)).toBe(2);
	});

	it('starts a fresh query after a pause', () => {
		const t = new Typeahead();
		t.type('c', labels, -1, 0);
		expect(t.pending(100)).toBe(true);
		expect(t.pending(1000)).toBe(false);
		expect(t.type('s', labels, 0, 1000)).toBe(3);
	});
});

describe('isTypeKey', () => {
	const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

	it('accepts a printable character and rejects commands and named keys', () => {
		expect(isTypeKey(key({ key: 'a' }))).toBe(true);
		expect(isTypeKey(key({ key: ' ' }))).toBe(true);
		expect(isTypeKey(key({ key: 'a', metaKey: true }))).toBe(false);
		expect(isTypeKey(key({ key: 'ArrowDown' }))).toBe(false);
	});
});
