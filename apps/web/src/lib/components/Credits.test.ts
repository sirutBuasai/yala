import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Credits from './Credits.svelte';

const accts = ['Assets:Venmo', 'Liabilities:CC:CardA'];

describe('Credits', () => {
	it('starts with no rows and adds one on "+ credit"', async () => {
		render(Credits, { props: { credits: [], creditAccounts: accts } });
		expect(screen.queryByPlaceholderText('amount')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByText('+ credit'));
		expect(screen.getByPlaceholderText('amount')).toBeInTheDocument();
	});

	it('renders one row per existing credit and removes on ✕', async () => {
		render(Credits, {
			props: {
				credits: [
					{ account: 'Assets:Venmo', amount: 20 },
					{ account: 'Assets:Venmo', amount: 5 }
				],
				creditAccounts: accts
			}
		});
		expect(screen.getAllByPlaceholderText('amount')).toHaveLength(2);

		await fireEvent.click(screen.getAllByText('✕')[0]);
		expect(screen.getAllByPlaceholderText('amount')).toHaveLength(1);
	});

	it('formats account options with the leaf de-CamelCaser', () => {
		render(Credits, {
			props: { credits: [{ account: 'Liabilities:CC:CardA', amount: 1 }], creditAccounts: accts }
		});
		// "Liabilities:CC:CardA" -> "Card A"
		expect(screen.getByRole('option', { name: 'Card A' })).toBeInTheDocument();
	});
});
