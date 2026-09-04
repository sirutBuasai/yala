// The gate in front of every "add an account" POST. A name that composes to nothing, or an alias
// that is pure punctuation, has to be refused here with a sentence naming the field — the API's own
// rejection reads in terms of the composed leaf, which is not what the user typed.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import AddAccountPanel from '$lib/views/manage/AddAccountPanel.svelte';

const opened = (name: string) => ({ account: `Assets:Cash:${name}`, name, error: null });

function panel(props: Record<string, unknown> = {}) {
	const open = vi.fn().mockResolvedValue(opened('BankOfExample'));
	render(AddAccountPanel, { props: { title: 'Add a bank account', open, ...props } });
	return open;
}

const type = (label: string, value: string) =>
	fireEvent.input(screen.getByLabelText(label), { target: { value } });

describe('AddAccountPanel', () => {
	it('opens the account once the required names are filled', async () => {
		const open = panel();

		await type('institution', 'Bank of Example');
		await type('account name', 'Cash Rewards');
		await fireEvent.click(screen.getByText('Add'));

		await waitFor(() => expect(open).toHaveBeenCalled());
		expect(open.mock.calls[0]![0]).toMatchObject({
			institution: 'Bank of Example',
			account_name: 'Cash Rewards'
		});
	});

	it('reports every missing name at once instead of one per submit', async () => {
		const open = panel();

		await fireEvent.click(screen.getByText('Add'));

		expect(await screen.findByText(/Institution is required/)).toBeInTheDocument();
		expect(screen.getByText(/Account name is required/)).toBeInTheDocument();
		expect(open).not.toHaveBeenCalled();
	});

	it('refuses a name that would compose to an empty account', async () => {
		const open = panel({ withAccountName: false });

		await type('institution', '!!!');
		await fireEvent.click(screen.getByText('Add'));

		expect(
			await screen.findByText(/Institution needs at least one letter or number/)
		).toBeInTheDocument();
		expect(open).not.toHaveBeenCalled();
	});

	it('checks a short form only when one was typed', async () => {
		const open = panel({ withAccountName: false });

		await type('institution', 'Bank of Example');
		await type('institution alias', '@@');
		await fireEvent.click(screen.getByText('Add'));

		expect(
			await screen.findByText(/Institution short form needs at least one letter or number/)
		).toBeInTheDocument();

		await type('institution alias', '');
		await fireEvent.click(screen.getByText('Add'));
		await waitFor(() => expect(open).toHaveBeenCalled());
	});

	it('blocks the open when the caller reports its own fields are wrong', async () => {
		const open = panel({
			withAccountName: false,
			validateExtra: () => 'List at least one contribution option.'
		});

		await type('institution', 'Bank of Example');
		await fireEvent.click(screen.getByText('Add'));

		expect(await screen.findByText(/List at least one contribution option/)).toBeInTheDocument();
		expect(open).not.toHaveBeenCalled();
	});
});
