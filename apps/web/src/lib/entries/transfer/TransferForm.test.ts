import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import type { AccountsInfo } from '$lib/data/load';
import { lastTransferFrom, lastTransferTo } from '$lib/utils/editPrefs';
import TransferForm from '$lib/entries/transfer/TransferForm.svelte';

const accounts: AccountsInfo = {
	spending_categories: [],
	funding_accounts: ['Assets:Cash:BankA', 'Liabilities:CC:CardA'],
	employers: [],
	payroll_options: [],
	cash_accounts: ['Assets:Cash:BankA'],
	credit_accounts: ['Liabilities:CC:CardA']
};

function okFetch() {
	return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
}

// The sticky last-used stores are module-scoped and leak across tests; reset so each test's
// seeded defaults are deterministic.
beforeEach(() => {
	lastTransferFrom.set('');
	lastTransferTo.set('');
});
afterEach(() => vi.unstubAllGlobals());

describe('TransferForm (add) — bill pay', () => {
	it('posts a transfer from the cash account to the credit card', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		render(TransferForm, { props: { accounts, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '250' } });
		await fireEvent.click(screen.getByText('+ Add'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const [url, opts] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('/api/transfer');
		const body = JSON.parse(opts.body);
		expect(body.from_account).toBe('Assets:Cash:BankA');
		expect(body.to_account).toBe('Liabilities:CC:CardA');
		expect(body.amount).toBe(250);
	});

	it('offers banks and Venmo as pay-toward targets, excluding the source account', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		const wide: AccountsInfo = {
			...accounts,
			cash_accounts: ['Assets:Cash:BankA'],
			credit_accounts: [
				'Assets:Cash:BankA',
				'Assets:Cash:BankB',
				'Assets:Cash:Venmo',
				'Liabilities:CC:CardA'
			]
		};
		render(TransferForm, { props: { accounts: wide, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '100' } });
		await fireEvent.click(screen.getByText('+ Add'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
		// Source seeds to the only bank; "pay toward" now defaults to a non-source account (another
		// bank), proving banks/Venmo are valid bill-pay targets — not just credit cards.
		expect(body.from_account).toBe('Assets:Cash:BankA');
		expect(body.to_account).toBe('Assets:Cash:BankB');
	});
});
