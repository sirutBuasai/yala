import { describe, expect, it } from 'vitest';
import { declutter } from '$lib/charts/declutter';

describe('declutter', () => {
	it('leaves labels that already clear each other where they want to be', () => {
		expect(declutter([10, 40, 80], 14, 0, 100)).toEqual([10, 40, 80]);
	});

	it('pushes a crowded label down past the one above it, keeping the order given', () => {
		expect(declutter([50, 20, 25], 14, 0, 100)).toEqual([50, 20, 34]);
	});

	it('packs an overrun stack back up from the bottom', () => {
		expect(declutter([90, 92, 95], 10, 0, 100)).toEqual([80, 90, 100]);
	});

	it('never places a label above the top', () => {
		expect(declutter([-5, 3], 10, 0, 100)).toEqual([0, 10]);
	});
});
