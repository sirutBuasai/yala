import { describe, expect, it } from 'vitest';
import { attentionItems } from '$lib/data/attention';
import { makeData } from '$lib/data/__fixtures__/dashboard';

const name = (a: string) => a.split(':').at(-1)!;

describe('attentionItems', () => {
	it('leads with pending rows, then unlogged balances', () => {
		const data = makeData();
		const key = data.meta.month_keys.at(-1)!;
		Object.values(data.months).find((m) => m.transactions.length)!.transactions[0]!.pending = true;
		const items = attentionItems(
			data,
			key,
			{
				month: '2026-09',
				roster: ['Assets:Cash:BankA', 'Liabilities:CC:CardB'],
				missing: ['Liabilities:CC:CardB']
			},
			name
		);
		expect(items.slice(0, 2)).toMatchObject([
			{ kind: 'pending', title: '1 pending transaction', pane: 'pending' },
			{
				kind: 'balances',
				title: '1 of 2 accounts not logged for Sep',
				detail: 'CardB',
				href: '/accounts?month=2026-09',
				focus: 'Liabilities:CC:CardB'
			}
		]);
	});

	it('lists nothing for balances where the API could not say', () => {
		const data = makeData();
		const items = attentionItems(data, data.meta.month_keys.at(-1)!, null, name);
		expect(items.some((i) => i.kind === 'balances')).toBe(false);
	});

	it('flags a category spending past the highest of its prior months', () => {
		const data = makeData();
		const key = data.meta.month_keys.at(-1)!;
		const row = data.months[key]!.by_category[0]!;
		row.amount = 1_000_000;
		const items = attentionItems(data, key, null, name);
		expect(items.find((i) => i.kind === 'category')).toMatchObject({
			title: `${row.category} is above its usual range`,
			pane: 'history',
			category: row.category
		});
	});
});
