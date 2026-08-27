import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import { get } from 'svelte/store';
import type { AccountsInfo } from '$lib/data/load';
import { lastCategory, lastFundingAccount } from '$lib/utils/editPrefs';
import TransactionForm from '$lib/forms/TransactionForm.svelte';

const accounts: AccountsInfo = {
	spending_categories: ['Grocery', 'Takeouts'],
	funding_accounts: ['Liabilities:CC:CardA', 'Assets:Cash:BankA'],
	employers: ['Employer1'],
	payroll_options: [],
	cash_accounts: ['Assets:Cash:BankA'],
	credit_accounts: ['Assets:Cash:Wallet', 'Liabilities:CC:CardA']
};

function okFetch(body: unknown = { ok: true, id: 'new-id' }) {
	return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

beforeEach(() => {
	// isolate the session-sticky add-form memory between tests
	lastFundingAccount.set('');
	lastCategory.set('');
});
afterEach(() => vi.unstubAllGlobals());

describe('TransactionForm (add)', () => {
	it('blocks submit and shows a message when required fields are empty', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });

		await fireEvent.click(screen.getByText('+ Add'));

		expect(screen.getByText('Title and total bill are required.')).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('posts the transaction and calls onsaved on success', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		const onsaved = vi.fn();
		render(TransactionForm, { props: { accounts, onsaved } });

		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'coffee' } });
		await fireEvent.input(screen.getByLabelText('Total bill'), { target: { value: '4.25' } });
		await fireEvent.click(screen.getByText('+ Add'));

		await waitFor(() => expect(onsaved).toHaveBeenCalledOnce());
		const [url, opts] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('/api/transaction');
		const sent = JSON.parse(opts.body);
		expect(sent).toMatchObject({
			payee: 'coffee',
			amount: 4.25,
			category: 'Grocery', // seeded default
			funding_account: 'Liabilities:CC:CardA' // seeded default
		});
	});

	it('shows the API error detail and does not call onsaved on failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				json: async () => ({ detail: 'account is closed' })
			})
		);
		const onsaved = vi.fn();
		render(TransactionForm, { props: { accounts, onsaved } });

		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'x' } });
		await fireEvent.input(screen.getByLabelText('Total bill'), { target: { value: '5' } });
		await fireEvent.click(screen.getByText('+ Add'));

		expect(await screen.findByText('account is closed')).toBeInTheDocument();
		expect(onsaved).not.toHaveBeenCalled();
	});

	it('reflects credits in the "Your share" total', async () => {
		vi.stubGlobal('fetch', okFetch());
		render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Total bill'), { target: { value: '300' } });
		await fireEvent.click(screen.getByText('+ credit'));
		// Total bill and the credit amount now share the "0" placeholder; the credit row is last.
		const amounts = screen.getAllByPlaceholderText('0');
		await fireEvent.input(amounts[amounts.length - 1]!, { target: { value: '200' } });

		// 300 total − 200 payback = $100 your share
		expect(screen.getByText('$100')).toBeInTheDocument();
	});

	it('add-new category posts /api/account with kind "category"', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true, account: 'Expenses:Gifts' })
		});
		vi.stubGlobal('fetch', fetchSpy);
		render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });

		// The Category field's "＋ new" reveals an inline input.
		await fireEvent.click(screen.getByTitle('Add a new category'));
		await fireEvent.input(screen.getByLabelText('new category name'), {
			target: { value: 'Gifts' }
		});
		await fireEvent.click(screen.getByText('Add'));

		const accountCall = fetchSpy.mock.calls.find((c) => c[0] === '/api/account');
		expect(accountCall).toBeTruthy();
		expect(JSON.parse(accountCall![1].body)).toEqual({ kind: 'category', leaf: 'Gifts' });
	});

	it('remembers the chosen funding account for the next add this session', async () => {
		vi.stubGlobal('fetch', okFetch());
		const { unmount } = render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'x' } });
		await fireEvent.input(screen.getByLabelText('Total bill'), { target: { value: '5' } });
		await fireEvent.click(screen.getByLabelText('Account'));
		await fireEvent.click(screen.getByRole('option', { name: 'Bank A' })); // Assets:Cash:BankA
		await fireEvent.click(screen.getByText('+ Add'));
		await waitFor(() => expect(get(lastFundingAccount)).toBe('Assets:Cash:BankA'));
		unmount();

		// a fresh add form pre-selects the remembered account, not the first option
		render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });
		expect(screen.getByLabelText('Account')).toHaveTextContent('Bank A');
	});

	it('remembers the chosen category for the next add this session', async () => {
		vi.stubGlobal('fetch', okFetch());
		const { unmount } = render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });

		// pick a non-default category (default is the first, 'Grocery'), then submit
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'x' } });
		await fireEvent.input(screen.getByLabelText('Total bill'), { target: { value: '5' } });
		await fireEvent.click(screen.getByLabelText('Category')); // open the listbox
		await fireEvent.click(screen.getByRole('option', { name: 'Takeouts' }));
		await fireEvent.click(screen.getByText('+ Add'));
		await waitFor(() => expect(get(lastCategory)).toBe('Takeouts'));
		unmount();

		// a fresh add form pre-selects the remembered category, not the first option
		render(TransactionForm, { props: { accounts, onsaved: vi.fn() } });
		expect(screen.getByLabelText('Category')).toHaveTextContent('Takeouts');
	});
});
