// One panel drives every account edit, and which controls it shows comes from the kind table the API
// sends. Renaming is not a mode here — a name is a field like any other — so the cases worth pinning
// are the ones where one Save has to split into several writes: a rename confused with a short-form
// edit, a contribution option renamed rather than replaced, and the order the writes go in.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import { live } from '$lib/data/load';
import type { AccountInfo, AccountLists } from '$lib/data/types';
import { makeAccounts, setDirectory } from '$lib/data/__fixtures__/dashboard';
import AccountPanel from '$lib/views/manage/AccountPanel.svelte';

const KINDS = Object.fromEntries(makeAccounts().kinds.map((k) => [k.name, k])) as Record<
	string,
	AccountLists['kinds'][number]
>;

const BROKERAGE = 'Assets:Investments:Taxable:BrokerageA';
const BANK = 'Assets:Cash:BankA';
const CARD = 'Liabilities:CC:CardA';

/** `renamed` is the path the rename route reports back, which is the only authority on where a
    renamed account went. */
function stubFetch(value = 0, renamed?: string) {
	const fetchSpy = vi.fn().mockImplementation((url: string) =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: async () => {
				if (String(url).includes('/value')) return { value };
				if (String(url).endsWith('/rename')) return { ok: true, account: renamed };
				return { ok: true };
			}
		})
	);
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

const postsTo = (fetchSpy: ReturnType<typeof vi.fn>, url: string) =>
	fetchSpy.mock.calls.filter(([called]) => String(called) === url);

const bodyOf = (fetchSpy: ReturnType<typeof vi.fn>, url: string) =>
	JSON.parse(postsTo(fetchSpy, url)[0]![1].body);

/** The write endpoints hit, in the order they were called. */
const order = (fetchSpy: ReturnType<typeof vi.fn>) =>
	fetchSpy.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/account/'));

/** Drive the on-brand listbox: open the trigger, then click the option. */
async function pick(trigger: HTMLElement, option: string) {
	await fireEvent.click(trigger);
	await fireEvent.click(screen.getByRole('option', { name: option }));
}

function panel(account: string, props: Record<string, unknown> = {}) {
	render(AccountPanel, { props: { account, kinds: KINDS, onchanged: vi.fn(), ...props } });
}

const type = (label: string, value: string) =>
	fireEvent.input(screen.getByLabelText(label), { target: { value } });

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

beforeEach(() => {
	live.set(true);
});

describe('AccountPanel — a name is a field, and a rename is still a rename', () => {
	it('renames a category by its one name', async () => {
		setDirectory({ 'Expenses:Grocery': { kind: 'category' } });
		const fetchSpy = stubFetch();
		panel('Expenses:Grocery');

		await type('Name for Grocery', 'Groceries');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/rename')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/rename')).toEqual({
			account: 'Expenses:Grocery',
			name: 'Groceries'
		});
	});

	it('renames a bank by its institution, which is its whole name', async () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		const fetchSpy = stubFetch();
		panel(BANK);

		await type('Institution', 'Bank of Z');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/rename')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/rename')).toEqual({
			account: BANK,
			institution_name: 'Bank of Z'
		});
	});

	it('renames a card by its product half, leaving the institution alone', async () => {
		setDirectory({
			[CARD]: {
				kind: 'card',
				institution_name: 'Bank of A',
				account_name: 'Cash',
				name: 'BoA Cash'
			}
		});
		const fetchSpy = stubFetch();
		panel(CARD);

		await type('Card product', 'Travel');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/rename')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/rename')).toEqual({
			account: CARD,
			account_name: 'Travel'
		});
	});

	it('shows each part as it was typed, not the shortened display name', () => {
		setDirectory({
			[CARD]: {
				kind: 'card',
				name: 'BoE Cash Rewards',
				institution_name: 'Bank of Example',
				account_name: 'Cash Rewards',
				institution_alias: 'BoE'
			}
		});
		stubFetch();
		panel(CARD);

		expect(screen.getByLabelText('Institution')).toHaveValue('Bank of Example');
		expect(screen.getByLabelText('Card product')).toHaveValue('Cash Rewards');
		expect(screen.getByLabelText('Institution alias')).toHaveValue('BoE');
	});

	it('names the other accounts held at the same institution, which a rename carries along', () => {
		setDirectory({
			[BANK]: { kind: 'bank', institution_name: 'Bank of A', name: 'Bank A' },
			[CARD]: { kind: 'card', institution_name: 'Bank of A', name: 'Card A' }
		});
		stubFetch();
		panel(BANK);

		expect(screen.getByText('Also at')).toBeInTheDocument();
		expect(screen.getByText('Card A')).toBeInTheDocument();
	});

	it('edits the short forms without touching the account path', async () => {
		setDirectory({
			[BANK]: { kind: 'bank', institution_name: 'Bank of A', institution_alias: 'BoA' }
		});
		const fetchSpy = stubFetch();
		panel(BANK);

		await type('Institution alias', 'BA');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/meta')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/meta')).toEqual({
			account: BANK,
			institution_alias: 'BA'
		});
		expect(postsTo(fetchSpy, '/api/account/rename')).toHaveLength(0);
	});

	it('offers a bank no account short form, having no account half to shorten', () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		stubFetch();
		panel(BANK);

		expect(screen.getByLabelText('Institution alias')).toBeInTheDocument();
		expect(screen.queryByLabelText('Account alias')).toBeNull();
	});

	it('offers a card both short forms', () => {
		setDirectory({ [CARD]: { kind: 'card', institution_name: 'Bank of A' } });
		stubFetch();
		panel(CARD);

		expect(screen.getByLabelText('Card product alias')).toBeInTheDocument();
	});

	it('moves an investment between tax tiers, which is a rename of its path', async () => {
		setDirectory({
			[BROKERAGE]: {
				kind: 'investment',
				tier: 'Taxable',
				institution_name: 'Brk',
				account_name: 'Taxable'
			}
		});
		const fetchSpy = stubFetch();
		panel(BROKERAGE);

		await pick(screen.getByLabelText('Tax treatment for BrokerageA'), 'Tax-advantaged');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/rename')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/rename')).toEqual({
			account: BROKERAGE,
			tier: 'TaxAdvantaged'
		});
	});
});

describe('AccountPanel — one Save, several writes, in one order', () => {
	it('sends the short form and the sweep together, each to its own endpoint', async () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		const fetchSpy = stubFetch();
		panel(BANK, { destinations: ['Assets:Cash:BankB'] });

		await type('Institution alias', 'BoA');
		await pick(screen.getByLabelText('Sweep destination for BankA'), 'BankB');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/sweep')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/meta')).toEqual({
			account: BANK,
			institution_alias: 'BoA'
		});
		expect(bodyOf(fetchSpy, '/api/account/sweep')).toEqual({
			account: BANK,
			dest: 'Assets:Cash:BankB'
		});
	});

	// A meta edit addresses the account by its CURRENT path, so a rename in the same Save has to go
	// last or the edit lands on a path that no longer exists.
	it('renames last, after the edits that address the old path', async () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		const fetchSpy = stubFetch();
		panel(BANK);

		await type('Institution', 'Bank of Z');
		await type('Institution alias', 'BoZ');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/rename')).toHaveLength(1));
		expect(order(fetchSpy)).toEqual(['/api/account/meta', '/api/account/rename']);
	});

	// Renaming moves the account to a new path, so the selection has to follow it or the view is left
	// pointing at an account that no longer exists. Where it went is the API's answer, never a guess.
	it('reports where a rename moved the account, before the dashboard reloads', async () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		stubFetch(0, 'Assets:Cash:BankZ');
		const onrenamed = vi.fn();
		const onchanged = vi.fn();
		panel(BANK, { onrenamed, onchanged });

		await type('Institution', 'Bank of Z');
		await save();

		await waitFor(() => expect(onrenamed).toHaveBeenCalledWith('Assets:Cash:BankZ'));
		expect(onrenamed.mock.invocationCallOrder[0]).toBeLessThan(
			onchanged.mock.invocationCallOrder[0]!
		);
	});

	it('leaves the selection alone when nothing was renamed', async () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		stubFetch();
		const onrenamed = vi.fn();
		const onchanged = vi.fn();
		panel(BANK, { onrenamed, onchanged });

		await type('Institution alias', 'BoA');
		await save();

		await waitFor(() => expect(onchanged).toHaveBeenCalled());
		expect(onrenamed).not.toHaveBeenCalled();
	});

	it('cannot be saved until something differs', () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A' } });
		stubFetch();
		panel(BANK);

		expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
	});

	it('sends nothing for a field that was only read', async () => {
		setDirectory({
			[BANK]: { kind: 'bank', institution_name: 'Bank of A', institution_alias: 'BoA' }
		});
		const fetchSpy = stubFetch();
		panel(BANK);

		await type('Institution alias', 'BoA');

		expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
		expect(postsTo(fetchSpy, '/api/account/meta')).toHaveLength(0);
	});

	it('puts back what was typed when the edit is discarded', async () => {
		setDirectory({
			[BANK]: { kind: 'bank', institution_name: 'Bank of A', institution_alias: 'BoA' }
		});
		stubFetch();
		panel(BANK);

		await type('Institution alias', 'nope');
		await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

		expect(screen.getByLabelText('Institution alias')).toHaveValue('BoA');
	});
});

describe('AccountPanel — contribution options are rows, and editing one is a rename', () => {
	const investment = (labels: string[]) => {
		setDirectory({
			[BROKERAGE]: {
				kind: 'investment',
				tier: 'Taxable',
				institution_name: 'Brk',
				account_name: 'Taxable',
				labels
			}
		});
		return stubFetch();
	};

	it('adds an option, which replaces the offered set', async () => {
		const fetchSpy = investment(['OptionA']);
		panel(BROKERAGE);

		await fireEvent.click(screen.getByRole('button', { name: '+ Option' }));
		await type('Contribution option 2', 'OptionB');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/meta')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/meta')).toEqual({
			account: BROKERAGE,
			labels: ['OptionA', 'OptionB']
		});
		expect(postsTo(fetchSpy, '/api/account/relabel')).toHaveLength(0);
	});

	it('removes an option, which only takes it out of the offered set', async () => {
		const fetchSpy = investment(['OptionA', 'OptionB']);
		panel(BROKERAGE);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove contribution option 2' }));
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/meta')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/meta')).toEqual({
			account: BROKERAGE,
			labels: ['OptionA']
		});
	});

	// Renaming a row in place is a relabel: it carries every contribution already logged under the
	// old name. An add or a remove cannot, which is why the two are different writes.
	it('renames an option in place, which rewrites its history too', async () => {
		const fetchSpy = investment(['OptionA']);
		panel(BROKERAGE);

		await type('Contribution option 1', 'OptionZ');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/relabel')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/relabel')).toEqual({
			account: BROKERAGE,
			old: 'OptionA',
			new: 'OptionZ'
		});
		expect(order(fetchSpy)[0]).toBe('/api/account/relabel');
	});

	it('splits a row pasted as a list, so several can be added at once', async () => {
		const fetchSpy = investment([]);
		panel(BROKERAGE);

		await fireEvent.click(screen.getByRole('button', { name: '+ Option' }));
		await type('Contribution option 1', 'OptionA, OptionB');
		await save();

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/meta')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/meta').labels).toEqual(['OptionA', 'OptionB']);
	});

	it('refuses two options of the same name', async () => {
		const fetchSpy = investment(['OptionA']);
		panel(BROKERAGE);

		await fireEvent.click(screen.getByRole('button', { name: '+ Option' }));
		await type('Contribution option 2', 'OptionA');
		await save();

		expect(await screen.findByText(/must be different/)).toBeInTheDocument();
		expect(postsTo(fetchSpy, '/api/account/meta')).toHaveLength(0);
	});
});

describe('AccountPanel — the end of a life', () => {
	it('offers a close, which happens in its own overlay', async () => {
		setDirectory({ [CARD]: { kind: 'card', institution_name: 'Bank of A' } });
		stubFetch();
		panel(CARD);

		expect(screen.queryByRole('dialog')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Close account' }));

		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('offers a closed account a reopen instead, and nothing to link', async () => {
		setDirectory({ [BANK]: { kind: 'bank', institution_name: 'Bank of A', closed: true } });
		const fetchSpy = stubFetch();
		panel(BANK, { destinations: ['Assets:Cash:BankB'] });

		expect(screen.queryByLabelText('Sweep destination for BankA')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Close account' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Reopen account' }));

		await waitFor(() => expect(postsTo(fetchSpy, '/api/account/reopen')).toHaveLength(1));
		expect(bodyOf(fetchSpy, '/api/account/reopen')).toEqual({ account: BANK });
	});
});
