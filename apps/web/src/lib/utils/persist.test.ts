// The revivers are the safety layer over localStorage: a stored preference outlives the release
// that wrote it, so these are what stop a stale or hand-edited value reaching the app.

import { beforeEach, describe, expect, it } from 'vitest';
import {
	listOf,
	matching,
	number,
	oneOf,
	persisted,
	Pref,
	record,
	shape
} from '$lib/utils/persist.svelte';

beforeEach(() => localStorage.clear());

describe('oneOf', () => {
	const revive = oneOf(['month', 'year', 'all'] as const);

	it('accepts a known member', () => {
		expect(revive('year')).toBe('year');
	});

	it('rejects an unknown string, a number, and null', () => {
		expect(revive('decade')).toBeUndefined();
		expect(revive(3)).toBeUndefined();
		expect(revive(null)).toBeUndefined();
	});
});

describe('matching', () => {
	const monthKey = matching(/^\d{4}-\d{2}$/);

	it('accepts a well-formed key', () => {
		expect(monthKey('2026-07')).toBe('2026-07');
	});

	it('rejects a partial or over-long key', () => {
		expect(monthKey('2026')).toBeUndefined();
		expect(monthKey('2026-07-01')).toBeUndefined();
	});
});

describe('number', () => {
	it('accepts a finite number in range', () => {
		expect(number(0, 9999)(2026)).toBe(2026);
	});

	it('rejects out-of-range, non-finite, and non-numeric values', () => {
		expect(number(0, 9999)(-1)).toBeUndefined();
		expect(number(0, 9999)(10000)).toBeUndefined();
		expect(number()(Number.NaN)).toBeUndefined();
		expect(number()('7')).toBeUndefined();
	});
});

describe('shape', () => {
	const revive = shape({ tab: oneOf(['home', 'activity'] as const), year: number(0, 9999) });

	it('keeps the entries that survive their own reviver', () => {
		expect(revive({ tab: 'activity', year: 2026 })).toEqual({ tab: 'activity', year: 2026 });
	});

	it('drops rejected entries rather than the whole object', () => {
		expect(revive({ tab: 'nope', year: 2026 })).toEqual({ year: 2026 });
	});

	it('ignores unknown keys', () => {
		expect(revive({ tab: 'home', junk: 1 })).toEqual({ tab: 'home' });
	});

	it('rejects a non-object', () => {
		expect(revive('home')).toBeUndefined();
	});
});

describe('record', () => {
	const revive = record(number(0));

	it('keeps arbitrary keys whose values survive', () => {
		expect(revive({ home: 0, activity: 420 })).toEqual({ home: 0, activity: 420 });
	});

	it('drops only the bad entries, not the whole table', () => {
		expect(revive({ home: 120, activity: -5, networth: 'x' })).toEqual({ home: 120 });
	});

	it('rejects an array or a non-object', () => {
		expect(revive([1, 2])).toBeUndefined();
		expect(revive('home')).toBeUndefined();
	});
});

describe('listOf', () => {
	const revive = listOf(matching(/^\w+$/));

	it('keeps the items that survive', () => {
		expect(revive(['Tax', 'Benefits'])).toEqual(['Tax', 'Benefits']);
	});

	it('drops bad items rather than failing the list', () => {
		expect(revive(['Tax', 3, 'a b', 'HSA'])).toEqual(['Tax', 'HSA']);
	});

	it('rejects a non-array', () => {
		expect(revive({ 0: 'Tax' })).toBeUndefined();
	});

	it('accepts an empty list', () => {
		expect(revive([])).toEqual([]);
	});
});

describe('persisted', () => {
	it('writes every value it takes, under the app namespace', () => {
		const store = persisted('demo', 'a', oneOf(['a', 'b'] as const));
		store.set('b');
		expect(localStorage.getItem('yala-demo')).toBe('"b"');
	});

	it('restores a stored value on construction', () => {
		localStorage.setItem('yala-demo', '"b"');
		let seen = '';
		persisted('demo', 'a', oneOf(['a', 'b'] as const)).subscribe((v) => (seen = v));
		expect(seen).toBe('b');
	});

	it('falls back when the stored value is rejected, corrupt, or absent', () => {
		const read = (raw: string | null) => {
			if (raw === null) localStorage.removeItem('yala-demo');
			else localStorage.setItem('yala-demo', raw);
			let seen = '';
			persisted('demo', 'a', oneOf(['a', 'b'] as const)).subscribe((v) => (seen = v));
			return seen;
		};
		expect(read('"zzz"')).toBe('a'); // valid JSON, invalid value
		expect(read('{not json')).toBe('a'); // unparseable
		expect(read(null)).toBe('a'); // never written
	});
});

describe('Pref', () => {
	it('reads back what it wrote', () => {
		const pref = new Pref('year', 0, number(0, 9999));
		pref.value = 2026;
		expect(pref.value).toBe(2026);
		expect(localStorage.getItem('yala-year')).toBe('2026');
	});

	it('starts from storage when it holds a valid value', () => {
		localStorage.setItem('yala-year', '2024');
		expect(new Pref('year', 0, number(0, 9999)).value).toBe(2024);
	});

	it('starts from the fallback when storage holds a value out of range', () => {
		localStorage.setItem('yala-year', '99999');
		expect(new Pref('year', 0, number(0, 9999)).value).toBe(0);
	});
});
