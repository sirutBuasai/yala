import { describe, expect, it } from 'vitest';
import { logYScale } from './axis';

describe('logYScale', () => {
	it('snaps the domain outward to whole decades', () => {
		const { y } = logYScale([6.11, 2857], 300);
		expect(y.domain()).toEqual([1, 10000]);
		expect(y(1)).toBe(300); // domain floor sits at the bottom of the range
		expect(y(10000)).toBe(0);
	});

	it('spreads a wide range instead of crushing the small values', () => {
		// The real failure mode of a linear axis: with a 468x spread the median lands at ~7% of
		// the height. On a log axis it should sit near the middle instead.
		const { y } = logYScale([6.11, 210, 2857], 300);
		const mid = y(210) / 300;
		expect(mid).toBeGreaterThan(0.3);
		expect(mid).toBeLessThan(0.7);
	});

	it('ticks are ascending powers of ten within the domain', () => {
		const { ticks } = logYScale([1, 10000], 300);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
		expect(ticks).toContain(1);
		expect(ticks).toContain(1000);
		for (const t of ticks) expect(Math.log10(t) % 1).toBeCloseTo(0);
	});

	it('subdivides a narrow span so it still gets gridlines', () => {
		const { ticks } = logYScale([120, 480], 300);
		expect(ticks.length).toBeGreaterThan(2);
	});

	it('ignores non-positive values, which a log axis cannot place', () => {
		const { y } = logYScale([-50, 0, 100], 300);
		expect(y.domain()).toEqual([100, 100]); // only the single positive value informs it
		expect(Number.isFinite(y(100))).toBe(true);
	});

	it('handles an empty series without throwing', () => {
		const { y, ticks } = logYScale([], 300);
		expect(Number.isFinite(y(1))).toBe(true);
		expect(ticks.length).toBeGreaterThan(0);
	});
});
