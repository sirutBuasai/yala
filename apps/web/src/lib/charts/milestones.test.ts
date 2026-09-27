import { describe, expect, it } from 'vitest';
import { barRange, groupLabels, RAIL, railThickness } from '$lib/charts/milestones';

/** Each member prints 40px wide, and a merged label as wide as its members side by side. */
const widthOf = (members: number[]) => members.length * 40;

describe('groupLabels', () => {
	it('keeps labels that clear each other apart', () => {
		const groups = groupLabels([50, 300, 600], widthOf, 800);
		expect(groups.map((g) => g.members)).toEqual([[0], [1], [2]]);
	});

	it('merges labels that would collide, and only those', () => {
		const groups = groupLabels([100, 110, 120, 600], widthOf, 800);
		expect(groups.map((g) => g.members)).toEqual([[0, 1, 2], [3]]);
	});

	it('leaves no two labels overlapping, however crowded', () => {
		const at = [0, 5, 10, 15, 20, 25];
		const groups = groupLabels(at, widthOf, 300);
		groups.slice(1).forEach((g, i) => {
			const before = groups[i]!;
			expect(before.left + before.width).toBeLessThanOrEqual(g.left);
		});
		expect(groups.flatMap((g) => g.members)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('holds a label at either end inside the timeline', () => {
		const [first, last] = groupLabels([0, 400], widthOf, 400);
		expect(first!.left).toBe(0);
		expect(last!.left).toBe(360);
	});

	it('centres a merged label over the span of its points', () => {
		const [group] = groupLabels([200, 220], widthOf, 800);
		expect(group!.left + group!.width / 2).toBe(210);
	});
});

describe('railThickness', () => {
	const ROW = 28;
	const { least, most } = barRange(ROW);

	it('is at its thinnest anywhere within a row of the least height', () => {
		expect(railThickness(least, ROW)).toBe(RAIL.least);
		expect(railThickness(least + ROW - 1, ROW)).toBe(RAIL.least);
		expect(railThickness(0, ROW)).toBe(RAIL.least);
	});

	it('thickens a step for each whole row past it, up to its thickest', () => {
		expect(railThickness(least + ROW, ROW)).toBe(RAIL.least + RAIL.step);
		expect(railThickness(least + 2 * ROW + 5, ROW)).toBe(RAIL.least + 2 * RAIL.step);
		expect(railThickness(most, ROW)).toBe(RAIL.most);
		expect(railThickness(most * 10, ROW)).toBe(RAIL.most);
	});
});
