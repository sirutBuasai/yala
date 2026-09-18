import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import PaycheckForm from '$lib/entries/paycheck/PaycheckForm.svelte';
import { makeAccounts } from '$lib/data/__fixtures__/dashboard';

const accounts = makeAccounts({
	funding_accounts: ['Assets:Cash:BankA'],
	employers: ['EmployerA'],
	payroll_options: [
		{ kind: 'deduction', label: 'Tax', employer: null, account: 'Expenses:Deductions:Tax' },
		{
			kind: 'contribution',
			label: 'Roth401k',
			employer: 'EmployerA',
			account: 'Assets:Investments:TaxAdvantaged:PlanA'
		}
	],
	cash_accounts: ['Assets:Cash:BankA']
});

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

		// Deductions is the first "+ row"; each added row defaults to the only option on offer.
		const addDeduction = screen.getAllByText('+ Row')[0]!;
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

describe('PaycheckForm (add) — a row follows the one above it', () => {
	it('starts a further deduction on the type already picked', async () => {
		const twoOptions = makeAccounts({
			funding_accounts: ['Assets:Cash:BankA'],
			employers: ['EmployerA'],
			payroll_options: [
				{ kind: 'deduction', label: 'Tax', employer: null, account: 'Expenses:Deductions:Tax' },
				{
					kind: 'deduction',
					label: 'Dental',
					employer: null,
					account: 'Expenses:Deductions:Dental'
				}
			],
			cash_accounts: ['Assets:Cash:BankA']
		});
		render(PaycheckForm, { props: { accounts: twoOptions, onsaved: vi.fn() } });

		const addDeduction = screen.getAllByText('+ Row')[0]!;
		await fireEvent.click(addDeduction);
		// The column may already hold remembered rows, so the pick and the assertion both go on the last.
		await fireEvent.click(screen.getAllByLabelText('deduction type').at(-1)!);
		await fireEvent.click(screen.getByRole('option', { name: 'Dental' }));
		await fireEvent.click(addDeduction);

		expect(screen.getAllByLabelText('deduction type').at(-1)).toHaveTextContent('Dental');
	});
});
