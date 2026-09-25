import { describe, expect, it } from 'vitest';
import { focusMonth, withFocus, withParams } from './focus';
import { RAIL_W, SIDEBAR_W, sidebarMode } from './sidebar';
import { CONTENT, ONE_COLUMN, WRAP_PAD } from '$lib/layout/grid/units';

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

describe('focusMonth', () => {
	it('reads the month from the URL, falling back when it is missing or not a month', () => {
		expect(focusMonth(new URL('http://y/t?month=2025-02'), '2026-09')).toBe('2025-02');
		expect(focusMonth(new URL('http://y/t'), '2026-09')).toBe('2026-09');
		expect(focusMonth(new URL('http://y/t?month=2025-00'), '2026-09')).toBe('2026-09');
	});
});

describe('withParams', () => {
	const url = new URL('http://y/transactions?month=2026-09&day=2026-09-03');

	it('sets and removes parameters, keeping the rest', () => {
		expect(withParams(url, { month: '2026-08', day: null })).toBe('/transactions?month=2026-08');
	});

	it('drops the question mark once nothing is left', () => {
		expect(withParams(url, { month: null, day: null })).toBe('/transactions');
	});
});

describe('sidebarMode', () => {
	const at = (side: number, content: number) => side + 2 * WRAP_PAD + content;

	it('shows in full while a full board still fits beside it', () => {
		expect(sidebarMode(at(SIDEBAR_W, CONTENT))).toBe('full');
		expect(sidebarMode(at(SIDEBAR_W, CONTENT) - 1)).toBe('rail');
	});

	it('keeps a full board beside the rail on a 1440px window', () => {
		expect(sidebarMode(1440)).toBe('rail');
		expect(1440 - RAIL_W - 2 * WRAP_PAD).toBeGreaterThanOrEqual(CONTENT);
	});

	it('folds into the sheet once even the rail would leave a one-column board', () => {
		expect(sidebarMode(at(RAIL_W, ONE_COLUMN) + 1)).toBe('rail');
		expect(sidebarMode(at(RAIL_W, ONE_COLUMN))).toBe('sheet');
	});
});
