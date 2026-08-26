import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import type { AccountsInfo } from '$lib/data/load';
import TransactionForm from '$lib/forms/TransactionForm.svelte';

const accounts: AccountsInfo = {
	spending_categories: ['Grocery', 'Takeouts'],
	funding_accounts: ['Liabilities:CC:CardA', 'Assets:Cash:BankA'],
	income_accounts: ['Income:Salary'],
	deduction_categories: ['Tax'],
	contribution_categories: ['HSA'],
	cash_accounts: ['Assets:Cash:BankA'],
	credit_accounts: ['Assets:Cash:Venmo', 'Liabilities:CC:CardA']
};

const prefill = {
	locator: 'id:abc',
	date: '2026-02-05',
	payee: 'lunch',
	amount: 40,
	net_expense: 40,
	category: 'Takeouts',
	funding_account: 'Liabilities:CC:CardA',
	pending: true,
	bill: null,
	credits: []
};

/** Route GET prefill vs POST writes; records calls for assertions. */
function routedFetch() {
	return vi.fn((url: string, opts: RequestInit) => {
		void opts;
		if (url.startsWith('/api/transaction?locator')) {
			return Promise.resolve({ ok: true, status: 200, json: async () => prefill });
		}
		return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
	});
}

afterEach(() => vi.unstubAllGlobals());

describe('TransactionForm (edit)', () => {
	it('prefills the form from GET /api/transaction', async () => {
		vi.stubGlobal('fetch', routedFetch());
		render(TransactionForm, { props: { locator: 'id:abc', accounts, onsaved: vi.fn() } });

		expect(await screen.findByDisplayValue('lunch')).toBeInTheDocument();
		expect(screen.getByDisplayValue('40')).toBeInTheDocument();
	});

	it('saves an update with the locator and edited fields', async () => {
		const fetchSpy = routedFetch();
		vi.stubGlobal('fetch', fetchSpy);
		const onsaved = vi.fn();
		render(TransactionForm, { props: { locator: 'id:abc', accounts, onsaved } });

		await screen.findByDisplayValue('lunch');
		await fireEvent.input(screen.getByDisplayValue('lunch'), { target: { value: 'brunch' } });
		await fireEvent.click(screen.getByText('Save changes'));

		await waitFor(() => expect(onsaved).toHaveBeenCalledOnce());
		const updateCall = fetchSpy.mock.calls.find((c) => c[0] === '/api/transaction/update');
		expect(updateCall).toBeTruthy();
		const sent = JSON.parse(updateCall![1].body as string);
		expect(sent).toMatchObject({ locator: 'id:abc', payee: 'brunch', category: 'Takeouts' });
	});

	it('requires a two-step confirm before deleting', async () => {
		const fetchSpy = routedFetch();
		vi.stubGlobal('fetch', fetchSpy);
		const onsaved = vi.fn();
		render(TransactionForm, { props: { locator: 'id:abc', accounts, onsaved } });
		await screen.findByDisplayValue('lunch');

		// First click only arms the confirmation — no delete request yet.
		await fireEvent.click(screen.getByText('Delete transaction'));
		expect(screen.getByText('Delete this transaction?')).toBeInTheDocument();
		expect(fetchSpy.mock.calls.some((c) => c[0] === '/api/transaction/delete')).toBe(false);

		await fireEvent.click(screen.getByText('Yes, delete'));
		await waitFor(() => expect(onsaved).toHaveBeenCalledOnce());
		const del = fetchSpy.mock.calls.find((c) => c[0] === '/api/transaction/delete');
		expect(JSON.parse(del![1].body as string)).toEqual({ locator: 'id:abc' });
	});
});
