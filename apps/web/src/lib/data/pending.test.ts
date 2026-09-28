import { describe, expect, it } from 'vitest';
import { pendingEntries } from '$lib/data/pending';
import { makeBillPay, makeData } from '$lib/data/__fixtures__/dashboard';

describe('pendingEntries', () => {
	it('lists pending bill pays beside pending transactions, newest first', () => {
		const data = makeData();
		data.months['2024-12']!.transactions[0]!.pending = true;
		data.months['2025-01']!.transfers = [
			makeBillPay(),
			makeBillPay({ locator: 'id:xf-2', pending: false })
		];

		expect(pendingEntries(data).map((e) => [e.type, e.locator])).toEqual([
			['xfer', 'id:xf-1'],
			['txn', 'id:tx-1']
		]);
	});
});
