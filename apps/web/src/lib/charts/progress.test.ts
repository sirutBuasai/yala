import { describe, it, expect } from 'vitest';
import { MONEY } from '$lib/data/primitives';
import { fillTo, fillText } from './progress';

describe('fillTo', () => {
	it('fills the share of the target the figure has reached', () => {
		expect(fillTo(25, 100)).toMatchObject({ width: '25%', over: false, reached: false });
	});

	// The whole point of the mark: scaled to the value, these two draw the same bar.
	it('holds the bar to the target rather than stretching to the value', () => {
		expect(fillTo(250, 100)).toMatchObject({ width: '100%', over: true });
		expect(fillTo(105, 100)).toMatchObject({ width: '100%', over: true });
	});

	it('marks the target met exactly at it, and not over it', () => {
		expect(fillTo(100, 100)).toMatchObject({ width: '100%', reached: true, over: false });
	});

	it('empties the track for a negative figure rather than drawing it backwards', () => {
		expect(fillTo(-40, 100)).toMatchObject({ width: '0%', reached: false });
	});

	it('draws nothing without a figure, or without a target to judge it by', () => {
		expect(fillTo(null, 100)).toBeNull();
		expect(fillTo(undefined, 100)).toBeNull();
		expect(fillTo(50, 0)).toBeNull();
	});
});

describe('fillText', () => {
	it('reads the figure against its target, since the track states neither', () => {
		expect(fillText(3, 12, MONEY())).toBe('$3 of $12');
	});

	it('says so when there is no figure', () => {
		expect(fillText(null, 12, MONEY())).toBe('not available');
	});
});
