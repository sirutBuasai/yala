import { describe, it, expect } from 'vitest';
import { moneyYScale } from './axis';

describe('moneyYScale', () => {
	it('anchors the domain at zero for all-positive values', () => {
		const { y } = moneyYScale([10, 40, 90], 300);
		expect(y(0)).toBe(300); // zero sits at the bottom (range start)
		expect(y.domain()[0]).toBe(0);
		expect(y.domain()[1]).toBeGreaterThanOrEqual(90);
	});

	it('extends the domain below zero when values are negative', () => {
		const { y } = moneyYScale([-50, 20], 300);
		expect(y.domain()[0]).toBeLessThanOrEqual(-50);
		expect(y.domain()[1]).toBeGreaterThanOrEqual(20);
		expect(y(0)).toBeGreaterThan(0);
		expect(y(0)).toBeLessThan(300);
	});

	it('maps the top of the range to y=0', () => {
		const { y } = moneyYScale([100], 300);
		expect(y(y.domain()[1])).toBe(0);
	});

	it('produces a handful of nice ticks', () => {
		const { ticks } = moneyYScale([0, 100], 300);
		expect(ticks.length).toBeGreaterThan(0);
		expect(ticks.length).toBeLessThanOrEqual(6);
		expect(ticks).toContain(0);
	});

	it('handles an empty series without throwing', () => {
		const { y, ticks } = moneyYScale([], 300);
		expect(Number.isFinite(y(0))).toBe(true);
		expect(ticks).toContain(0);
	});
});
