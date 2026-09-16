import { describe, expect, it } from 'vitest';
import { DOT, labelGhost, labelText, live, words } from '$lib/ui/label';

describe('labelText', () => {
	it('reads a title as one phrase, the derived half first', () => {
		expect(labelText({ context: '2026', text: 'cash flow' })).toBe('2026 cash flow');
	});

	it('separates a caption into its two statements', () => {
		expect(labelText({ context: 'Aug 2026', text: 'per month', join: DOT })).toBe(
			'Aug 2026 · per month'
		);
	});

	it('drops the separator when a half was emptied on purpose, leaving the derived half alone', () => {
		expect(labelText({ context: 'Jul 2026', text: '' }, DOT)).toBe('Jul 2026');
	});

	it('drops the separator when a half is missing, either way round', () => {
		expect(labelText({ context: 'Sep 10, 2026', join: DOT })).toBe('Sep 10, 2026');
		expect(labelText({ text: 'Paychecks', join: DOT })).toBe('Paychecks');
	});

	it('takes the join from the slot, so no caption has to remember the dot', () => {
		const label = { context: 'Aug 2026', text: 'per month' };
		expect(labelText(label)).toBe('Aug 2026 per month');
		expect(labelText(label, DOT)).toBe('Aug 2026 · per month');
	});

	it('lets a label override the join its slot reads with', () => {
		expect(labelText({ context: '2026', text: 'cash flow', join: ' / ' }, DOT)).toBe(
			'2026 / cash flow'
		);
	});

	it('is empty for an absent label, so a card can ask whether to draw a header at all', () => {
		expect(labelText(undefined)).toBe('');
		expect(labelText({})).toBe('');
	});
});

describe('labelGhost', () => {
	it('shows the derived half with the separator the label will read with', () => {
		expect(labelGhost({ context: 'Aug 2026', text: 'per month', join: DOT })).toBe('Aug 2026 · ');
		expect(labelGhost({ context: '2026', text: 'cash flow' })).toBe('2026 ');
	});

	it('is empty for a label the code wrote in full, which has nothing to keep current', () => {
		expect(labelGhost({ text: 'Paychecks' })).toBe('');
	});

	it('takes its separator from the slot as the text does', () => {
		expect(labelGhost({ context: 'Aug 2026', text: 'per month' }, DOT)).toBe('Aug 2026 · ');
	});
});

describe('words / live', () => {
	it('marks an authored label renameable and a derived one current', () => {
		expect(words('Paychecks')).toEqual({ text: 'Paychecks' });
		expect(live('3 in Aug 2026')).toEqual({ context: '3 in Aug 2026' });
	});

	it('keeps a derived label out of the half a rename replaces', () => {
		const note = live('vs your $4,330 / mo average');
		expect(note.text).toBeUndefined();
		expect(labelText({ ...note, text: 'my own words' }, DOT)).toBe(
			'vs your $4,330 / mo average · my own words'
		);
	});
});
