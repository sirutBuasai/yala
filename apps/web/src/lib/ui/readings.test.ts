import { describe, expect, it } from 'vitest';
import { fittest } from '$lib/ui/readings';
import { readingsOf, MONEY } from '$lib/data/primitives';

describe('readingsOf', () => {
	it('reads money to the cent, then whole, then abbreviated, dropping a repeat', () => {
		expect(readingsOf(12345.678, MONEY())).toEqual(['$12,345.68', '$12,346', '$12k']);
		expect(readingsOf(450, MONEY())).toEqual(['$450.00', '$450']);
	});

	it('signs a gain when asked', () => {
		expect(readingsOf(1200, MONEY(), true)[0]).toBe('+$1,200.00');
	});
});

describe('fittest', () => {
	it('picks the fullest level every figure has room for', () => {
		expect(
			fittest([
				{ widths: [90, 60, 30], room: 100 },
				{ widths: [120, 70, 30], room: 100 }
			])
		).toBe(1);
	});

	it('falls to the most compact when nothing fuller fits', () => {
		expect(fittest([{ widths: [90, 60, 30], room: 20 }])).toBe(2);
	});
});
