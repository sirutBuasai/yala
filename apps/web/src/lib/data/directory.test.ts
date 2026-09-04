import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { accountInfo, setAccountDirectory } from '$lib/data/directory.svelte';
import { data } from '$lib/data/load';
import type { DashboardData } from '$lib/data/types';

afterEach(() => {
	setAccountDirectory({});
	data.set(null);
});

describe('accountInfo', () => {
	it('returns what the ledger declared', () => {
		setAccountDirectory({
			'Liabilities:CC:BankOfExampleCashRewards': {
				name: 'BoE Cash Rewards',
				institution: 'Bank of Example'
			}
		});

		expect(accountInfo('Liabilities:CC:BankOfExampleCashRewards')).toEqual({
			name: 'BoE Cash Rewards',
			institution: 'Bank of Example'
		});
	});

	it('returns undefined for an unknown or nullish account', () => {
		expect(accountInfo('Assets:Cash:Nope')).toBeUndefined();
		expect(accountInfo(null)).toBeUndefined();
		expect(accountInfo(undefined)).toBeUndefined();
	});
});

describe('syncing with the loaded document', () => {
	function doc(accounts: DashboardData['meta']['accounts']): DashboardData {
		return { meta: { accounts } } as DashboardData;
	}

	it('follows the data store, so a loader cannot forget to update it', () => {
		data.set(doc({ 'Assets:Cash:BankA': { name: 'Bank A', institution: 'Bank of Example' } }));

		expect(accountInfo('Assets:Cash:BankA')?.name).toBe('Bank A');
	});

	it('drops the old directory when a different document loads', () => {
		data.set(doc({ 'Assets:Cash:BankA': { name: 'Bank A' } }));
		data.set(doc({ 'Assets:Cash:BankB': { name: 'Bank B' } }));

		expect(accountInfo('Assets:Cash:BankA')).toBeUndefined();
		expect(accountInfo('Assets:Cash:BankB')?.name).toBe('Bank B');
	});

	it('empties when the document is cleared', () => {
		data.set(doc({ 'Assets:Cash:BankA': { name: 'Bank A' } }));
		data.set(null);

		expect(accountInfo('Assets:Cash:BankA')).toBeUndefined();
	});
});
