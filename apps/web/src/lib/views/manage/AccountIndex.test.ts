// The index is only about finding an account, so what is worth pinning is what it HIDES: an account
// this app cannot act on, a group nobody opened, and a closed account — which is a group of its own
// rather than a separate list, since a reopen has to be able to reach it.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import type { AccountInfo } from '$lib/data/types';
import AccountIndex from '$lib/views/manage/AccountIndex.svelte';

const KINDS = ['bank', 'card', 'investment', 'category', 'employer', 'deduction'];

function index(entries: Record<string, Partial<AccountInfo>>, selected: string | null = null) {
	setAccountDirectory(
		Object.fromEntries(
			Object.entries(entries).map(([account, info]) => [
				account,
				{ name: account.split(':').pop()!, ...info } as AccountInfo
			])
		)
	);
	const onselect = vi.fn();
	render(AccountIndex, { props: { kindNames: KINDS, selected, onselect } });
	return onselect;
}

const group = (name: string) => screen.getByRole('button', { name });
const groups = () =>
	screen
		.getAllByRole('button', { expanded: false })
		.concat(screen.queryAllByRole('button', { expanded: true }))
		.map((b) => b.textContent?.trim());

describe('AccountIndex', () => {
	it('leaves out an account this app does not manage', async () => {
		index({
			'Assets:Cash:BankA': { kind: 'bank' },
			'Equity:Adjustments:BankA': {} // a plug: no kind, nothing to act on
		});

		await fireEvent.click(group('Banks 1'));

		expect(screen.getByText('BankA')).toBeInTheDocument();
		expect(screen.queryByText('Adjustments:BankA')).toBeNull();
	});

	it('keeps every group shut until one is asked for', async () => {
		index({ 'Assets:Cash:BankA': { kind: 'bank' } });

		expect(screen.queryByText('BankA')).toBeNull();

		await fireEvent.click(group('Banks 1'));
		expect(screen.getByText('BankA')).toBeInTheDocument();

		await fireEvent.click(group('Banks 1'));
		expect(screen.queryByText('BankA')).toBeNull();
	});

	it('holds one group open at a time', async () => {
		index({ 'Assets:Cash:BankA': { kind: 'bank' }, 'Liabilities:CC:CardA': { kind: 'card' } });

		await fireEvent.click(group('Banks 1'));
		await fireEvent.click(group('Cards 1'));

		expect(screen.getByText('CardA')).toBeInTheDocument();
		expect(screen.queryByText('BankA')).toBeNull();
	});

	it('files a closed account under Closed rather than under its kind', async () => {
		index({
			'Assets:Cash:BankA': { kind: 'bank' },
			'Assets:Cash:Old': { kind: 'bank', closed: true }
		});

		await fireEvent.click(group('Banks 1'));
		expect(screen.queryByText('Old')).toBeNull();
		expect(screen.getByText('BankA')).toBeInTheDocument();
	});

	// Closed is a dropdown of kinds, not a flat list: a closed account is looked for the same way an
	// open one is, and one closed kind should not bury the others.
	it('nests Closed by kind, one kind at a time', async () => {
		index({
			'Assets:Cash:Old': { kind: 'bank', closed: true },
			'Liabilities:CC:Starter': { kind: 'card', closed: true }
		});

		await fireEvent.click(group('Closed 2'));

		expect(screen.queryByText('Old')).toBeNull();
		expect(screen.queryByText('Starter')).toBeNull();

		await fireEvent.click(group('Banks 1'));
		expect(screen.getByText('Old')).toBeInTheDocument();

		await fireEvent.click(group('Cards 1'));
		expect(screen.getByText('Starter')).toBeInTheDocument();
		expect(screen.queryByText('Old')).toBeNull();
	});

	it('shuts Closed again, taking its kinds with it', async () => {
		index({ 'Assets:Cash:Old': { kind: 'bank', closed: true } });

		await fireEvent.click(group('Closed 1'));
		await fireEvent.click(group('Banks 1'));
		expect(screen.getByText('Old')).toBeInTheDocument();

		await fireEvent.click(group('Closed 1'));
		expect(screen.queryByText('Old')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Banks 1' })).toBeNull();
	});

	it('opens the group holding the selection, so a selected account is never hidden', () => {
		index({ 'Assets:Cash:BankA': { kind: 'bank' } }, 'Assets:Cash:BankA');

		expect(screen.getByText('BankA')).toBeInTheDocument();
	});

	it('opens Closed AND the kind within it when the selection is a closed account', () => {
		index({ 'Assets:Cash:Old': { kind: 'bank', closed: true } }, 'Assets:Cash:Old');

		expect(screen.getByText('Old')).toBeInTheDocument();
	});

	it('searches the display name and the path alike, across every group at once', async () => {
		index({
			'Assets:Cash:BankA': { kind: 'bank', name: 'Bank of Example' },
			'Liabilities:CC:CardA': { kind: 'card', name: 'Card A' }
		});

		await fireEvent.input(screen.getByLabelText('Search accounts'), {
			target: { value: 'liabilities' }
		});

		expect(screen.getByText('Card A')).toBeInTheDocument();
		expect(screen.queryByText('Bank of Example')).toBeNull();
		expect(screen.queryByRole('button', { name: /^Cards/ })).toBeNull();
	});

	it('offers no group for a kind nothing is declared under', () => {
		index({ 'Assets:Cash:BankA': { kind: 'bank' } });

		expect(groups()).toContain('Banks 1');
		expect(groups().some((n) => n?.startsWith('Employers'))).toBe(false);
	});

	it('reports the account picked, by path', async () => {
		const onselect = index({ 'Assets:Cash:BankA': { kind: 'bank' } });

		await fireEvent.click(group('Banks 1'));
		await fireEvent.click(screen.getByText('BankA'));

		expect(onselect).toHaveBeenCalledWith('Assets:Cash:BankA');
	});
});
