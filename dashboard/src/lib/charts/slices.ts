// Declutter a category breakdown into ≤ topN named slices (theme category colors)
// plus a single neutral "Other" slice for the remainder. Colors are CSS custom
// properties so the donut themes with the :root[data-theme] swap (no JS colors).

import { categoryVar } from '../theme';

export interface Slice {
	name: string;
	value: number;
	color: string;
}

export function categorySlices(items: { category: string; amount: number }[], topN = 6): Slice[] {
	const sorted = items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
	const slices: Slice[] = sorted
		.slice(0, topN)
		.map((i) => ({ name: i.category, value: i.amount, color: categoryVar(i.category) }));
	const otherSum = sorted.slice(topN).reduce((a, i) => a + i.amount, 0);

	if (otherSum > 0) {
		const existing = slices.find((s) => s.name === 'Other');

		if (existing) existing.value += otherSum;
		else slices.push({ name: 'Other', value: otherSum, color: 'var(--ink-3)' });
	}

	return slices;
}
