// A close moves a whole balance and only a reopen undoes it, so the cases worth pinning are the ones a
// wrong guess would send to the API: a split that doesn't add up, an employer's linked accounts closed
// when nobody said to, and the review that stands between the button and the write.
//
// The flow is a question at a time, so most cases walk it: `Next` until the review, then Close account.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import { live } from '$lib/data/load';
import type { AccountInfo, AccountLists } from '$lib/data/types';
import { makeAccounts, setDirectory } from '$lib/data/__fixtures__/dashboard';
import CloseAccount from '$lib/views/manage/CloseAccount.svelte';

const KINDS = Object.fromEntries(makeAccounts().kinds.map((k) => [k.name, k])) as Record<
	string,
	AccountLists['kinds'][number]
>;

const BROKERAGE = 'Assets:Investments:Taxable:BrokerageA';
const BANK = 'Assets:Cash:BankA';
const CARD = 'Liabilities:CC:CardA';

/** A GET for the account value plus a POST for the write; both go through the same fetch. */
function stubFetch(value = 0) {
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

const closes = (fetchSpy: ReturnType<typeof vi.fn>) =>
	fetchSpy.mock.calls.filter(([url]) => String(url) === '/api/account/close');
const body = (fetchSpy: ReturnType<typeof vi.fn>) => JSON.parse(closes(fetchSpy)[0]![1].body);

/** Drive the on-brand listbox: open the trigger, then click the option. */
async function pick(trigger: HTMLElement, option: string) {
	await fireEvent.click(trigger);
	await fireEvent.click(screen.getByRole('option', { name: option }));
}

function flow(
	account: string,
	kind: string,
	destinations: string[] = [],
	props: Record<string, unknown> = {}
) {
	const onclosed = vi.fn();
	render(CloseAccount, {
		props: { account, kind: KINDS[kind]!, destinations, onclose: vi.fn(), onclosed, ...props }
	});
	return onclosed;
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Close account' }));
/** The step counter, which is absent while the flow has only one question — and on the review, which
    is not a question. */
const step = () => screen.queryByText(/Close account · step/)?.textContent ?? '';

/** Answer every question, leaving the review on screen. */
async function toReview() {
	while (screen.queryByRole('button', { name: 'Next' })) await next();
}

beforeEach(() => {
	live.set(true);
});

describe('CloseAccount — how many questions the kind needs', () => {
	// A paid-off card moves nothing and links to nothing, so there is nothing to ask: the flow opens on
	// the review. The date is a row there, as it is when opening an account.
	it('asks a paid-off card nothing at all', () => {
		setDirectory({ [CARD]: { kind: 'card' } });
		stubFetch();
		flow(CARD, 'card');

		expect(screen.getByText('Close it?')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
		expect(screen.getByLabelText('Close date for CardA')).toBeInTheDocument();
	});

	// One question for every kind that holds anything, answerable either way: all to one account, or
	// divided across several. A bank and an investment differ only in what the API takes underneath.
	// `as const` so the kind narrows to the contract's union rather than to `string`.
	it.each([
		['bank', BANK, 'Closing account balance destination for BankA'],
		['investment', BROKERAGE, 'Closing account balance destination for BrokerageA']
	] as const)(
		'asks a %s where the money goes, one account by default',
		async (kind, account, field) => {
			setDirectory({ [account]: { kind, tier: 'Taxable' } });
			stubFetch(1500);
			flow(account, kind, [CARD]);
			await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

			expect(
				screen.getByText('Transfer the closing account balance to one or more accounts')
			).toBeInTheDocument();
			expect(screen.getByLabelText(field)).toBeInTheDocument();
			// This question, then the review.
			expect(step()).toContain('step 1 of 2');

			await fireEvent.click(
				screen.getByRole('button', { name: /Transfer balance to multiple accounts/ })
			);
			expect(screen.getByLabelText('Destination 1')).toBeInTheDocument();

			await fireEvent.click(
				screen.getByRole('button', { name: /Transfer balance to a single account/ })
			);
			expect(screen.getByLabelText(field)).toBeInTheDocument();
		}
	);

	// An account with nothing in it is never asked where its nothing should go.
	it('asks an empty account nothing, and sends nothing to move', async () => {
		setDirectory({ [BROKERAGE]: { kind: 'investment', tier: 'Taxable' } });
		const fetchSpy = stubFetch(0);
		flow(BROKERAGE, 'investment', [BANK]);
		await waitFor(() => expect(screen.getByText('Close it?')).toBeInTheDocument());

		expect(screen.getByText('Already empty')).toBeInTheDocument();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy)).toEqual({ account: BROKERAGE });
	});

	// The API refuses a close that would take a balance off the balance sheet with no entry saying
	// where it went, and a card cannot move money — so the flow says so instead of walking to a button
	// that will fail.
	it('refuses a card that still owes, naming what to do instead', async () => {
		setDirectory({ [CARD]: { kind: 'card' } });
		const fetchSpy = stubFetch();
		flow(CARD, 'card', [], { balance: -1204.18 });

		expect(screen.getByText('Pay it off first')).toBeInTheDocument();
		// To the cent: it is a figure they have to clear exactly. The amount sits in its own element, so
		// the sentence is matched across children.
		expect(
			screen.getByText((_, el) => /still holds \$1,204\.18/.test(el?.textContent ?? ''), {
				selector: 'p'
			})
		).toBeInTheDocument();

		// Nowhere to go from here, so the flow offers the way out and nothing else.
		expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
		expect(screen.queryByText('Close it?')).toBeNull();
		expect(closes(fetchSpy)).toHaveLength(0);
	});
});

describe('CloseAccount — the review is the confirmation', () => {
	it('writes nothing while the review is only being read', async () => {
		setDirectory({ [BANK]: { kind: 'bank' } });
		const fetchSpy = stubFetch(500);
		flow(BANK, 'bank', ['Assets:Cash:BankB']);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await pick(screen.getByLabelText('Closing account balance destination for BankA'), 'BankB');
		await next();

		expect(screen.getByText('Close it?')).toBeInTheDocument();
		expect(step()).toContain('step 2 of 2');
		expect(closes(fetchSpy)).toHaveLength(0);
	});

	it('closes a card, which holds nothing to move', async () => {
		setDirectory({ [CARD]: { kind: 'card' } });
		const fetchSpy = stubFetch();
		const onclosed = flow(CARD, 'card');

		await toReview();
		await confirm();

		await waitFor(() => expect(onclosed).toHaveBeenCalled());
		expect(body(fetchSpy)).toEqual({ account: CARD });
	});

	// Said in prose, not as a row: it is the same sentence on every close, so it is not an answer
	// anyone reviews — it is the reassurance that closing is not deleting.
	it('says what is kept, so closing never reads as deleting', async () => {
		setDirectory({ [CARD]: { kind: 'card' } });
		stubFetch();
		flow(CARD, 'card');

		await toReview();

		expect(screen.getByText(/You can reopen the account at a later date/)).toBeInTheDocument();
	});
});

describe('CloseAccount — where the money goes', () => {
	it('refuses to leave the question with no destination picked', async () => {
		setDirectory({ [BROKERAGE]: { kind: 'investment', tier: 'Taxable' } });
		const fetchSpy = stubFetch(1500);
		flow(BROKERAGE, 'investment', [BANK]);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await next();

		expect(await screen.findByText(/Destination is required/)).toBeInTheDocument();
		expect(
			screen.getByText('Transfer the closing account balance to one or more accounts')
		).toBeInTheDocument();
		expect(closes(fetchSpy)).toHaveLength(0);
	});

	// A bank's whole balance goes as a `destination`, which is what its route takes.
	it('sends a bank one destination for the lot', async () => {
		setDirectory({ [BANK]: { kind: 'bank' } });
		const fetchSpy = stubFetch(500);
		flow(BANK, 'bank', ['Assets:Cash:BankB']);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await pick(screen.getByLabelText('Closing account balance destination for BankA'), 'BankB');
		await toReview();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy).destination).toBe('Assets:Cash:BankB');
		expect(body(fetchSpy).legs).toBeUndefined();
	});

	// An investment's route takes no destination, so "all to one account" is one leg for the whole
	// value — the same act, in the only shape the API accepts.
	it('sends an investment one leg for the lot', async () => {
		setDirectory({ [BROKERAGE]: { kind: 'investment', tier: 'Taxable' } });
		const fetchSpy = stubFetch(1500);
		flow(BROKERAGE, 'investment', [BANK]);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await pick(
			screen.getByLabelText('Closing account balance destination for BrokerageA'),
			'BankA'
		);
		await toReview();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy).legs).toEqual([{ destination: BANK, amount: 1500 }]);
		expect(body(fetchSpy).destination).toBeUndefined();
	});

	it('refuses parts that do not add up to what it holds', async () => {
		setDirectory({ [BROKERAGE]: { kind: 'investment', tier: 'Taxable' } });
		stubFetch(1500);
		flow(BROKERAGE, 'investment', [BANK]);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await fireEvent.click(
			screen.getByRole('button', { name: /Transfer balance to multiple accounts/ })
		);
		await pick(screen.getByLabelText('Destination 1'), 'BankA');
		await fireEvent.input(screen.getByLabelText('Amount 1'), { target: { value: '1000' } });
		await next();

		expect(await screen.findByText(/must total/)).toBeInTheDocument();
	});

	it('divides across several when asked to', async () => {
		setDirectory({ [BROKERAGE]: { kind: 'investment', tier: 'Taxable' } });
		const fetchSpy = stubFetch(1500);
		flow(BROKERAGE, 'investment', [BANK, CARD]);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await fireEvent.click(
			screen.getByRole('button', { name: /Transfer balance to multiple accounts/ })
		);
		await pick(screen.getByLabelText('Destination 1'), 'BankA');
		await fireEvent.input(screen.getByLabelText('Amount 1'), { target: { value: '1000' } });
		await fireEvent.click(screen.getByRole('button', { name: '+ Destination' }));
		await pick(screen.getByLabelText('Destination 2'), 'CardA');
		await toReview();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy).legs).toEqual([
			{ destination: BANK, amount: 1000 },
			{ destination: CARD, amount: 500 }
		]);
	});

	it('starts a further part on the destination above it', async () => {
		setDirectory({ [BROKERAGE]: { kind: 'investment', tier: 'Taxable' } });
		stubFetch(1500);
		flow(BROKERAGE, 'investment', [BANK, CARD]);
		await waitFor(() => expect(screen.queryByText('Valuing...')).not.toBeInTheDocument());

		await fireEvent.click(
			screen.getByRole('button', { name: /Transfer balance to multiple accounts/ })
		);
		await pick(screen.getByLabelText('Destination 1'), 'CardA');
		await fireEvent.input(screen.getByLabelText('Amount 1'), { target: { value: '1000' } });
		await fireEvent.click(screen.getByRole('button', { name: '+ Destination' }));

		expect(screen.getByLabelText('Destination 2')).toHaveTextContent('CardA');
	});
});

describe('CloseAccount — an employer decides about its linked accounts', () => {
	const EMPLOYER = 'Income:Salary:Employer1';
	const DEDUCTION = 'Expenses:Deductions:Parking';
	const PLAN = 'Assets:Investments:TaxAdvantaged:Employer401k';

	function employer() {
		// The display name reads as words while the `employer` meta stores the leaf, which is the pair
		// the flow has to match on. A name that happened to equal its own leaf would hide that.
		setDirectory({
			[EMPLOYER]: { kind: 'employer', name: 'Employer 1' },
			[DEDUCTION]: { kind: 'deduction', name: 'Parking', employer: 'Employer1' },
			[PLAN]: { kind: 'investment', name: 'Employer 401k', employer: 'Employer1' }
		});
		const fetchSpy = stubFetch();
		flow(EMPLOYER, 'employer');
		return fetchSpy;
	}

	it('asks what closes with it, ticking the deductions', () => {
		employer();

		expect(screen.getByText('What closes with it?')).toBeInTheDocument();
		expect(screen.getByLabelText('Close Parking with Employer 1')).toBeChecked();
		expect(screen.getByLabelText('Close Employer 401k with Employer 1')).not.toBeChecked();
	});

	it('sends the ticked accounts, and only those', async () => {
		const fetchSpy = employer();

		await toReview();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy).close_with).toEqual([DEDUCTION]);
	});

	it('sends an empty list when nothing is ticked, which unlinks them all', async () => {
		const fetchSpy = employer();

		await fireEvent.click(screen.getByLabelText('Close Parking with Employer 1'));
		await toReview();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy).close_with).toEqual([]);
	});

	it('takes a plan along when it is ticked', async () => {
		const fetchSpy = employer();

		await fireEvent.click(screen.getByLabelText('Close Employer 401k with Employer 1'));
		await toReview();
		await confirm();

		await waitFor(() => expect(closes(fetchSpy)).toHaveLength(1));
		expect(body(fetchSpy).close_with).toEqual([DEDUCTION, PLAN]);
	});

	it('asks no such question for a kind nothing is linked to', () => {
		setDirectory({ 'Expenses:Grocery': { kind: 'category' } });
		stubFetch();
		flow('Expenses:Grocery', 'category');

		expect(screen.queryByText('What closes with it?')).toBeNull();
	});
});
