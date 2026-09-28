import { describe, expect, it } from 'vitest';
import {
	THEME_COLORS,
	parseHex,
	perceivedDistance,
	suggestions,
	toHex,
	toHsv
} from '$lib/ui/color/color';

describe('parseHex', () => {
	it('stores any case and the short form as lowercase #rrggbb', () => {
		expect(parseHex(' #ABCDEF ')).toBe('#abcdef');
		expect(parseHex('#abc')).toBe('#aabbcc');
	});

	it('refuses anything but a hex literal', () => {
		expect(parseHex('red')).toBeNull();
		expect(parseHex('abcdef')).toBeNull();
		expect(parseHex('#abcd')).toBeNull();
	});
});

describe('hsv', () => {
	it('round-trips every theme colour', () => {
		for (const c of THEME_COLORS) expect(toHex(toHsv(c))).toBe(c);
	});

	it('reads a grey as no saturation', () => {
		expect(toHsv('#808080').s).toBe(0);
	});
});

describe('suggestions', () => {
	it('never offers a colour already in use', () => {
		const used = THEME_COLORS.slice(0, 10);
		expect(suggestions(used).some((c) => used.includes(c))).toBe(false);
	});

	it('offers five, each as far from what is in use as the pool allows', () => {
		const used = ['#f7768e', '#7dcfff'];
		const picks = suggestions(used);
		expect(picks).toHaveLength(5);

		const nearest = (c: string) => Math.min(...used.map((u) => perceivedDistance(c, u)));
		const rest = THEME_COLORS.filter((c) => !used.includes(c) && c !== picks[0]);
		expect(rest.every((c) => nearest(c) <= nearest(picks[0]!))).toBe(true);
	});

	it('offers what is left once the theme runs short', () => {
		expect(suggestions(THEME_COLORS.slice(2))).toEqual(THEME_COLORS.slice(0, 2));
	});
});
