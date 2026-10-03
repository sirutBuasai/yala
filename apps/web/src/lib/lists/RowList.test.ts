import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';
import TransferList from '$lib/lists/TransferList.svelte';

const txn = (over: Partial<TxnRow>): TxnRow => ({
	locator: 'id:a',
	date: '2026-09-27',
	payee: 'shampoo',
	amount: 48,
	category: 'Personal',
	source: 'Liabilities:CC:CardA',
	pending: false,
	...over
});

const rows = [txn({ locator: 'id:p', payee: 'birite', pending: true }), txn({ locator: 'id:s' })];

function okFetch() {
	return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
}

const posted = (spy: ReturnType<typeof vi.fn>, url: string) =>
	spy.mock.calls.filter((c) => c[0] === url).map((c) => JSON.parse(c[1].body));

afterEach(() => vi.unstubAllGlobals());

describe('RowList marks', () => {
	it('offers post and delete on a pending row, and only delete on a posted one', () => {
		render(TransactionList, { props: { transactions: rows, onedit: vi.fn() } });
		expect(screen.getByRole('button', { name: 'Mark birite as posted' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete birite' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Mark shampoo as posted' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Delete shampoo' })).toBeInTheDocument();
	});

	it('offers no marks on a read-only list', () => {
		render(TransactionList, { props: { transactions: rows } });
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('opens the editor from a row named by its cells, not its marks', async () => {
		const onedit = vi.fn();
		render(TransactionList, { props: { transactions: rows, onedit } });
		const opener = screen.getByRole('button', { name: '9/27 shampoo Personal CardA $48' });
		await fireEvent.click(opener);
		expect(onedit).toHaveBeenCalledWith('id:s');
	});

	it('posts a pending row in one click', async () => {
		const spy = okFetch();
		vi.stubGlobal('fetch', spy);
		render(TransactionList, { props: { transactions: rows, onedit: vi.fn() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Mark birite as posted' }));
		await waitFor(() => expect(posted(spy, '/api/entry/post')).toEqual([{ locator: 'id:p' }]));
	});

	it('deletes only on the second click, and Escape backs out', async () => {
		const spy = okFetch();
		vi.stubGlobal('fetch', spy);
		render(TransactionList, { props: { transactions: rows, onedit: vi.fn() } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete shampoo' }));
		const confirm = screen.getByRole('button', { name: 'Confirm delete shampoo' });
		await waitFor(() => expect(confirm).toHaveFocus());
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByRole('button', { name: 'Confirm delete shampoo' })).toBeNull();
		expect(posted(spy, '/api/entry/delete')).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete shampoo' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm delete shampoo' }));
		await waitFor(() => expect(posted(spy, '/api/entry/delete')).toEqual([{ locator: 'id:s' }]));
	});

	it('shows a refused action under its row', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 422,
				json: async () => ({ detail: 'already posted' })
			})
		);
		render(TransactionList, { props: { transactions: rows, onedit: vi.fn() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Mark birite as posted' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('already posted');
	});

	it('offers no marks on an auto-managed sweep', () => {
		const sweep = {
			locator: 'id:w',
			date: '2026-09-30',
			payee: 'passthrough sweep',
			amount: 30,
			from_account: 'Assets:Cash:Savings',
			to_account: 'Assets:Cash:Venmo',
			pending: false,
			auto_managed: true
		};
		render(TransferList, { props: { transfers: [sweep], onedit: vi.fn() } });
		expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
		expect(screen.getAllByRole('button')).toHaveLength(1);
	});
});
