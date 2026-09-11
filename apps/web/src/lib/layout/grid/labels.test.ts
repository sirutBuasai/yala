import { beforeEach, describe, expect, it } from 'vitest';
import { BoardLabels, MAX } from '$lib/layout/grid/labels';
import { DOT, labelText } from '$lib/ui/label';

const declared = { context: '2026', text: 'cash flow' };
/** Every id the cases below rename; a board only keeps names for cards it has. */
const IDS = ['cashflow', 'trend', 'day', 'categories', 'pending', 'a', 'b'];

describe('BoardLabels', () => {
	beforeEach(() => localStorage.clear());

	it('leaves a label alone until it is renamed', () => {
		const labels = new BoardLabels('board', IDS);
		expect(labels.label('cashflow', 'title', declared)).toEqual(declared);
	});

	it('replaces the words but keeps the derived half, and its join', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('cashflow', 'title', 'money in and out');

		expect(labels.label('cashflow', 'title', declared)).toEqual({
			context: '2026',
			text: 'money in and out'
		});
		expect(
			labels.label('trend', 'caption', { context: 'Aug', text: 'per month', join: DOT })
		).toEqual({ context: 'Aug', text: 'per month', join: DOT });
	});

	it('hides a half emptied on purpose, leaving whatever the app derives', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('trend', 'caption', '');

		const hidden = labels.label('trend', 'caption', { context: 'Jul 2026', text: 'income went' })!;
		expect(hidden.text).toBe('');
		// The separator goes with the words it separated.
		expect(labelText(hidden, DOT)).toBe('Jul 2026');
	});

	it('hides a label outright when there is nothing derived behind it', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('cashflow', 'caption', '');
		expect(labelText(labels.label('cashflow', 'caption', { text: 'Totals' }), DOT)).toBe('');
	});

	it('names a label the view never declared at all, which is how a caption is added', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('categories', 'caption', 'the ones I actually use');
		expect(labels.label('categories', 'caption', undefined)).toEqual({
			text: 'the ones I actually use'
		});
	});

	it('gives a label with no declared text a name of its own', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('day', 'title', 'Day detail');
		expect(labels.label('day', 'title', { context: 'Sep 10, 2026' })).toEqual({
			context: 'Sep 10, 2026',
			text: 'Day detail'
		});
	});

	it('stores what was typed, so a space between two words survives', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('cashflow', 'title', 'money ');
		expect(labels.textOf('cashflow', 'title')).toBe('money ');
	});

	it('caps a rename at a length a title can still be', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('cashflow', 'title', 'x'.repeat(MAX + 50));
		expect(labels.textOf('cashflow', 'title')).toHaveLength(MAX);
	});

	it('names each half of a card on its own', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('cashflow', 'title', 'mine');
		labels.set('cashflow', 'caption', 'also mine');

		expect(labels.textOf('cashflow', 'title')).toBe('mine');
		expect(labels.textOf('cashflow', 'caption')).toBe('also mine');
	});

	it('puts the whole board back to the names the app ships', () => {
		const labels = new BoardLabels('board', IDS);
		labels.set('a', 'title', 'one');
		labels.set('b', 'title', '');

		labels.reset();
		expect(labels.label('a', 'title', declared)).toEqual(declared);
		expect(labels.label('b', 'title', declared)).toEqual(declared);
	});

	it('survives a reload, and boards do not read each other', () => {
		new BoardLabels('home', IDS).set('pending', 'title', 'Owed to me');

		expect(new BoardLabels('home', IDS).textOf('pending', 'title')).toBe('Owed to me');
		expect(new BoardLabels('activity:month', IDS).textOf('pending', 'title')).toBeUndefined();
	});

	it('drops a name for a card this board no longer has, rather than leaving it to be inherited', () => {
		new BoardLabels('home', IDS).set('pending', 'title', 'Owed to me');
		new BoardLabels('home', ['cashflow']);

		expect(localStorage.getItem('yala-labels-home-1')).toBe('{}');
		expect(new BoardLabels('home', IDS).textOf('pending', 'title')).toBeUndefined();
	});

	it('keeps the names of the cards that remain', () => {
		const labels = new BoardLabels('home', IDS);
		labels.set('pending', 'title', 'Owed to me');
		labels.set('trend', 'title', 'what I am worth');

		expect(new BoardLabels('home', ['trend']).textOf('trend', 'title')).toBe('what I am worth');
	});

	it('drops a stored rename that is no longer a string', () => {
		localStorage.setItem('yala-labels-home-1', JSON.stringify({ pending: { title: 42 } }));
		expect(new BoardLabels('home', IDS).textOf('pending', 'title')).toBeUndefined();
	});
});
