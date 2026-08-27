import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import type { AccountsInfo } from '$lib/data/load';
import TransferForm from '$lib/forms/TransferForm.svelte';

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

afterEach(() => vi.unstubAllGlobals());

describe('TransferForm (add) — bill pay', () => {
	it('posts a transfer from the cash account to the credit card', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		render(TransferForm, { props: { accounts, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '250' } });
		await fireEvent.click(screen.getByText('+ Add bill pay'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const [url, opts] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('/api/transfer');
		const body = JSON.parse(opts.body);
		expect(body.from_account).toBe('Assets:Cash:BankA');
		expect(body.to_account).toBe('Liabilities:CC:CardA');
		expect(body.amount).toBe(250);
	});

	it('seeds pay-toward to a credit card, skipping cash in the money-in list', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		const mixed: AccountsInfo = {
			...accounts,
			credit_accounts: ['Assets:Cash:BankA', 'Liabilities:CC:CardA']
		};
		render(TransferForm, { props: { accounts: mixed, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '100' } });
		await fireEvent.click(screen.getByText('+ Add bill pay'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		expect(JSON.parse(fetchSpy.mock.calls[0]![1].body).to_account).toBe('Liabilities:CC:CardA');
	});
});
