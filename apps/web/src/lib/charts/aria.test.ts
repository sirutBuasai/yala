import { describe, expect, it } from 'vitest';
import { chartLabel } from '$lib/charts/aria';

describe('chartLabel', () => {
	it('names the chart, then its series', () => {
		expect(chartLabel('Ranked bars', ['A', 'B'])).toBe('Ranked bars: A, B');
	});

	it('appends what the chart spans', () => {
		expect(chartLabel('Bar chart', ['A', 'B'], ' across 12 periods')).toBe(
			'Bar chart: A, B across 12 periods'
		);
		expect(chartLabel('Heatmap', ['Jan'], ' by Food, Rent')).toBe('Heatmap: Jan by Food, Rent');
	});

	it('says nothing extra when there is no span to give', () => {
		expect(chartLabel('Line chart', ['A'], '')).toBe('Line chart: A');
	});
});
