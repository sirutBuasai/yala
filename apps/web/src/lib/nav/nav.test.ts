import { describe, expect, it } from 'vitest';
import { withFocus } from './focus';
import { docks, SIDEBAR_W } from './sidebar';
import { ONE_COLUMN, WRAP_PAD } from '$lib/layout/grid/units';

describe('withFocus', () => {
	const at = (search: string) => new URL(`http://yala.local/cash-flow${search}`);

	it('carries the focus month to the next page', () => {
		expect(withFocus('/transactions', at('?month=2026-03&view=year'))).toBe(
			'/transactions?month=2026-03'
		);
	});

	it('drops everything else the current page put in its URL', () => {
		expect(withFocus('/accounts', at('?view=year&category=Takeouts'))).toBe('/accounts');
	});

	it('ignores a month that is not a real calendar month', () => {
		expect(withFocus('/', at('?month=2026-13'))).toBe('/');
		expect(withFocus('/', at('?month=march'))).toBe('/');
	});
});

describe('docks', () => {
	const floor = SIDEBAR_W + 2 * WRAP_PAD + ONE_COLUMN;

	it('docks only while the page beside it stays wider than one column', () => {
		expect(docks(floor + 1)).toBe(true);
		expect(docks(floor)).toBe(false);
	});
});
