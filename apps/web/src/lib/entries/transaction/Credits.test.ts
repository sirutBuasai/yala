import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import Credits from '$lib/entries/transaction/Credits.svelte';
import { reactive } from '$lib/utils/reactive.svelte';

const accts = ['Assets:Cash:Wallet', 'Liabilities:CC:CardA'];

describe('Credits', () => {
	beforeEach(() =>
		setAccountDirectory({
			'Assets:Cash:Wallet': { name: 'Wallet' },
			'Liabilities:CC:CardA': { name: 'Card A', institution: 'Bank of Example' }
		})
	);
	afterEach(() => setAccountDirectory({}));

	it('starts with no rows and adds one on "+ credit"', async () => {
		render(Credits, { props: { credits: reactive([]), creditAccounts: accts } });
		expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByText('+ credit'));
		expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
	});

	it('renders one row per existing credit and removes on ✕', async () => {
		render(Credits, {
			props: {
				credits: reactive([
					{ value: 'Assets:Cash:Wallet', amount: 20 },
					{ value: 'Assets:Cash:Wallet', amount: 5 }
				]),
				creditAccounts: accts
			}
		});
		expect(screen.getAllByPlaceholderText('0')).toHaveLength(2);

		await fireEvent.click(screen.getAllByText('✕')[0]!);
		expect(screen.getAllByPlaceholderText('0')).toHaveLength(1);
	});

	it('labels account options with the name from the account directory', async () => {
		render(Credits, {
			props: {
				credits: reactive([{ value: 'Liabilities:CC:CardA', amount: 1 }]),
				creditAccounts: accts
			}
		});
		// open the custom Select; the option shows the ledger's name for the account, not its path
		await fireEvent.click(screen.getByLabelText('credit account'));
		expect(screen.getByRole('option', { name: 'Card A' })).toBeInTheDocument();
	});
});
