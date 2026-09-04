// Retiring an investment writes a split that has to add up. The cases worth pinning are the two
// that would otherwise reach the API as a rejected leg: an empty account (no legs at all, not one
// leg of zero) and a leg with no destination picked.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import InvestmentRow from '$lib/views/manage/InvestmentRow.svelte';

/** `investmentValue` GETs, then `closeInvestment` POSTs; both go through the same fetch. */
function stubFetch(value: number) {
	const fetchSpy = vi.fn().mockImplementation((url: string) =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: async () => (String(url).includes('/value') ? { value } : { ok: true })
		})
	);
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

async function openDrawer(destinations: string[], value: number) {
	const fetchSpy = stubFetch(value);
	render(InvestmentRow, {
		props: {
			account: 'Assets:Investments:Taxable:BrokerZ',
			destinations,
			onchanged: vi.fn()
		}
	});

	await fireEvent.click(screen.getByText('Retire'));
	await waitFor(() => expect(screen.queryByText('Valuing…')).not.toBeInTheDocument());
	return fetchSpy;
}

const posted = (fetchSpy: ReturnType<typeof vi.fn>) =>
	fetchSpy.mock.calls.filter(([url]) => String(url) === '/api/investment/close');

describe('InvestmentRow retire', () => {
	it('sends the split when it totals the account value', async () => {
		const fetchSpy = await openDrawer(['Assets:Cash:BankA'], 1500);

		await fireEvent.click(screen.getByText('Retire account'));

		await waitFor(() => expect(posted(fetchSpy)).toHaveLength(1));
		const body = JSON.parse(posted(fetchSpy)[0]![1].body);
		expect(body.legs).toEqual([{ destination: 'Assets:Cash:BankA', amount: 1500 }]);
	});

	it('retires an empty account with no legs rather than one leg of zero', async () => {
		const fetchSpy = await openDrawer(['Assets:Cash:BankA'], 0);

		await fireEvent.click(screen.getByText('Retire account'));

		await waitFor(() => expect(posted(fetchSpy)).toHaveLength(1));
		expect(JSON.parse(posted(fetchSpy)[0]![1].body).legs).toEqual([]);
	});

	it('refuses a leg with no destination picked', async () => {
		const fetchSpy = await openDrawer([], 1500);

		await fireEvent.click(screen.getByText('Retire account'));

		expect(await screen.findByText(/Destination 1 is required/)).toBeInTheDocument();
		expect(posted(fetchSpy)).toHaveLength(0);
	});
});
