import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import type { AccountsInfo } from '$lib/data/load';
import PaycheckForm from '$lib/entries/paycheck/PaycheckForm.svelte';

const accounts: AccountsInfo = {
	spending_categories: [],
	funding_accounts: ['Assets:Cash:Bank1'],
	employers: ['Employer1'],
	payroll_options: [
		{ kind: 'deduction', label: 'Tax', employer: null, account: 'Expenses:Deductions:Tax' },
		{
			kind: 'contribution',
			label: 'Roth401k',
			employer: 'Employer1',
			account: 'Assets:Investments:TaxAdvantaged:Employer401k'
		}
	],
	cash_accounts: ['Assets:Cash:Bank1'],
	credit_accounts: []
};

function okFetch() {
	return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
}

afterEach(() => vi.unstubAllGlobals());

describe('PaycheckForm (add) — same-label rows sum', () => {
	it('adds two Tax rows into a single summed deduction', async () => {
		const fetchSpy = okFetch();
		vi.stubGlobal('fetch', fetchSpy);
		render(PaycheckForm, { props: { accounts, onsaved: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Gross'), { target: { value: '1000' } });

		// Deductions is the first "+ row"; each added row defaults to the sole option ("Tax").
		const addDeduction = screen.getAllByText('+ row')[0]!;
		await fireEvent.click(addDeduction);
		await fireEvent.click(addDeduction);

		// Number inputs sharing the "0" placeholder: [gross, tax-row-1, tax-row-2].
		const amounts = screen.getAllByPlaceholderText('0');
		await fireEvent.input(amounts[1]!, { target: { value: '150' } });
		await fireEvent.input(amounts[2]!, { target: { value: '150' } });

		await fireEvent.click(screen.getByText('+ Add'));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const [url, opts] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('/api/paycheck');
		expect(JSON.parse(opts.body).deductions).toEqual({ Tax: 300 });
	});
});
