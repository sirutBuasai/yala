import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import { lastTransferFrom, lastTransferTo } from '$lib/utils/editPrefs';
import TransferForm from '$lib/entries/transfer/TransferForm.svelte';
import { makeAccounts } from '$lib/data/__fixtures__/dashboard';
import { forgetDrafts } from '$lib/forms/draft.svelte';

const accounts = makeAccounts({
	funding_accounts: ['Assets:Cash:BankA', 'Liabilities:CC:CardA'],
	cash_accounts: ['Assets:Cash:BankA'],
	card_accounts: ['Liabilities:CC:CardA']
});

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

	it('offers banks and passthroughs as pay-toward targets, excluding the source account', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		const wide = makeAccounts({
			...accounts,
			cash_accounts: ['Assets:Cash:BankA'],
			funding_accounts: [
				'Assets:Cash:BankA',
				'Assets:Cash:BankB',
				'Assets:Cash:Passthrough',
				'Liabilities:CC:CardA'
			]
		});
		render(TransferForm, { props: { accounts: wide, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '100' } });
		await fireEvent.click(screen.getByText('+ Add'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
		// Source seeds to the only bank; "pay toward" now defaults to a non-source account (another
		// bank), proving banks/passthroughs are valid bill-pay targets — not just credit cards.
		expect(body.from_account).toBe('Assets:Cash:BankA');
		expect(body.to_account).toBe('Assets:Cash:BankB');
	});
});

describe('TransferForm (add) — draft', () => {
	const amount = () => screen.getByLabelText('Amount') as HTMLInputElement;

	it('keeps what was typed when the form closes and reopens, until a reload', async () => {
		const first = render(TransferForm, { props: { accounts, onsaved: vi.fn() } });
		await fireEvent.input(amount(), { target: { value: '250' } });
		first.unmount();

		const second = render(TransferForm, { props: { accounts, onsaved: vi.fn() } });
		await waitFor(() => expect(amount().value).toContain('250'));
		second.unmount();

		forgetDrafts();
		render(TransferForm, { props: { accounts, onsaved: vi.fn() } });
		expect(amount().value).toBe('');
	});

	it('lets the day the form opened on outrank the draft', async () => {
		const first = render(TransferForm, { props: { accounts, onsaved: vi.fn() } });
		await fireEvent.input(amount(), { target: { value: '250' } });
		first.unmount();

		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		render(TransferForm, { props: { accounts, presetDate: '2026-03-04', onsaved: vi.fn() } });
		await fireEvent.click(screen.getByText('+ Add'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
		expect(body).toMatchObject({ date: '2026-03-04', amount: 250 });
	});

	it('drops the draft once it saves', async () => {
		vi.stubGlobal('fetch', okFetch());
		const onsaved = vi.fn();
		const first = render(TransferForm, { props: { accounts, onsaved } });
		await fireEvent.input(amount(), { target: { value: '250' } });
		await fireEvent.click(screen.getByText('+ Add'));
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		first.unmount();

		render(TransferForm, { props: { accounts, onsaved: vi.fn() } });
		expect(amount().value).toBe('');
	});

	it('keeps no draft of an edit', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					amount: 99,
					from_account: 'Assets:Cash:BankA',
					to_account: 'Liabilities:CC:CardA'
				})
			})
		);
		const edit = render(TransferForm, { props: { accounts, locator: 'id:1', onsaved: vi.fn() } });
		await waitFor(() => expect(amount().value).toContain('99'));
		edit.unmount();

		render(TransferForm, { props: { accounts, onsaved: vi.fn() } });
		expect(amount().value).toBe('');
	});
});
