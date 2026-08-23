import { categoryVar } from '../theme';

export interface Slice {
	name: string;
	value: number;
	color: string;
}

export function categorySlices(items: { category: string; amount: number }[], limit = 10): Slice[] {
	const sorted = items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
	const named = (list: typeof sorted): Slice[] =>
		list.map((i) => ({ name: i.category, value: i.amount, color: categoryVar(i.category) }));

	// Everything fits — show each category on its own.
	if (sorted.length <= limit) return named(sorted);

	// Overflow: top (limit - 1) individually, then one combined "Other" slice for the rest.
	const slices = named(sorted.slice(0, limit - 1));
	const restSum = sorted.slice(limit - 1).reduce((a, i) => a + i.amount, 0);
	slices.push({ name: 'Other', value: restSum, color: 'var(--ink-3)' });

	return slices;
}
