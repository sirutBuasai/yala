// One guided flow serves all six kinds, so the cases worth pinning are the ones where the *kind*
// decides what is asked: how many questions there are, which name fields they ask for, and the gate in
// front of the POST. A name that composes to nothing has to be refused here with a sentence naming the
// field — the API's own rejection reads in terms of the composed leaf, which is not what was typed.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/dom';
import { live } from '$lib/data/load';
import type { AccountLists } from '$lib/data/types';
import { makeAccounts } from '$lib/data/__fixtures__/dashboard';
import NewAccount from '$lib/views/manage/NewAccount.svelte';

const KINDS = Object.fromEntries(makeAccounts().kinds.map((k) => [k.name, k])) as Record<
	string,
	AccountLists['kinds'][number]
>;

function flow(props: Record<string, unknown> = {}) {
	const fetchSpy = vi
		.fn()
		.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, name: 'Added' }) });
	vi.stubGlobal('fetch', fetchSpy);
	render(NewAccount, { props: { kinds: KINDS, onclose: vi.fn(), onsaved: vi.fn(), ...props } });
	return fetchSpy;
}

const posted = (fetchSpy: ReturnType<typeof vi.fn>) =>
	JSON.parse(fetchSpy.mock.calls.find(([url]) => String(url) === '/api/account')![1].body);

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
/** The step counter, absent until the kind has decided how many questions there are. */
const step = () => screen.queryByText(/New account · step/)?.textContent ?? '';

const type = (label: string, value: string) =>
	fireEvent.input(screen.getByLabelText(label), { target: { value } });

/** Picking a kind is also the answer to "what next?", so it advances on its own. */
const pickKind = (name: string) =>
	fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));

/** Answer nothing further and land on the review. */
async function toReview() {
	while (screen.queryByRole('button', { name: 'Next' })) await next();
}

beforeEach(() => {
	live.set(true);
});

describe('NewAccount — the kind decides what is asked', () => {
	it('opens on the kind, which is the only question every kind shares', () => {
		flow();

		expect(screen.getByText('What are you adding?')).toBeInTheDocument();
		// No count yet: this answer is what decides how many questions follow.
		expect(step()).toBe('');
	});

	it('asks a category for one name, and nothing else', async () => {
		flow();

		await pickKind('Category');

		// The kind decided the shape, so the numbering starts here and ends on the review.
		expect(step()).toContain('step 1 of 2');
		expect(screen.getByText('What is the category called?')).toBeInTheDocument();
		expect(screen.queryByLabelText('Institution')).toBeNull();
	});

	it('asks a bank for an institution alone', async () => {
		flow();

		await pickKind('Bank');

		expect(screen.getByText('Who holds it?')).toBeInTheDocument();
		expect(screen.getByLabelText('Institution')).toBeInTheDocument();
		await next();
		expect(screen.queryByLabelText('Account name')).toBeNull();
	});

	it('asks a card who issued it, then what the card itself is called', async () => {
		flow();

		await pickKind('Card');
		expect(screen.getByText('Who issued it?')).toBeInTheDocument();

		await type('Institution', 'Bank of Example');
		await next();

		expect(screen.getByText('What is the card product?')).toBeInTheDocument();
		expect(screen.getByLabelText('Card product')).toBeInTheDocument();
	});

	it('asks an investment about tax and payroll, which a bank is never asked', async () => {
		flow({ employers: ['EmployerA'] });

		await pickKind('Investment');
		// Four questions after the kind, plus the review.
		expect(step()).toContain('of 5');

		await type('Institution', 'Example Brokerage');
		await next();
		await type('Account name', 'Roth IRA');
		await next();

		expect(screen.getByText('What is the tax treatment of the investment?')).toBeInTheDocument();
		await next();
		expect(
			screen.getByText("Does this account's contribution come from an employer?")
		).toBeInTheDocument();
	});

	it('forgets answers that the new kind has no field for', async () => {
		flow();

		await pickKind('Card');
		await type('Institution', 'Bank of Example');
		await back();
		await pickKind('Bank');

		expect(screen.getByLabelText('Institution')).toHaveValue('');
	});
});

describe('NewAccount — the gate in front of the POST', () => {
	it('will not leave a question its answer is missing', async () => {
		const fetchSpy = flow();

		await pickKind('Bank');
		await next();

		expect(await screen.findByText(/Institution is required/)).toBeInTheDocument();
		expect(step()).toContain('step 1 of');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses a name carrying anything the composer would drop', async () => {
		const fetchSpy = flow();

		await pickKind('Category');
		await type('New category name', '!Test');
		await next();

		expect(
			await screen.findByText(/Name can only contain letters, numbers and spaces/)
		).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses a name already in use, naming it', async () => {
		const fetchSpy = flow({ taken: { category: ['Grocery'] } });

		await pickKind('Category');
		await type('New category name', 'Grocery');
		await next();

		expect(await screen.findByText(/Grocery already exists/)).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses two contribution options of the same name', async () => {
		flow({ employers: ['EmployerA'] });

		await pickKind('Investment');
		await type('Institution', 'Example Brokerage');
		await next();
		await type('Account name', 'Roth IRA');
		await next();
		await next(); // tax tier, defaulted

		await fireEvent.click(screen.getByRole('button', { name: '+ Option' }));
		await fireEvent.click(screen.getByRole('button', { name: '+ Option' }));
		await type('Contribution option 1', 'Roth 401k');
		await type('Contribution option 2', 'Roth 401k');
		await next();

		expect(await screen.findByText(/must be different/)).toBeInTheDocument();
	});
});

describe('NewAccount — the review, and what it sends', () => {
	it('opens a category from its one answer', async () => {
		const fetchSpy = flow();

		await pickKind('Category');
		await type('New category name', 'Gift Cards');
		await toReview();
		await add();

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		expect(posted(fetchSpy)).toEqual({ kind: 'category', name: 'Gift Cards' });
	});

	it('sends an investment its tier, employer and options', async () => {
		const fetchSpy = flow({ employers: ['EmployerA'] });

		await pickKind('Investment');
		await type('Institution', 'Example Brokerage');
		await next();
		await type('Account name', 'Roth IRA');
		await next();
		await fireEvent.click(screen.getByRole('button', { name: /^Tax-advantaged/ }));
		await next();
		await fireEvent.click(screen.getByRole('button', { name: 'EmployerA' }));
		await fireEvent.click(screen.getByRole('button', { name: '+ Option' }));
		await type('Contribution option 1', 'Roth 401k');
		await toReview();
		await add();

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		expect(posted(fetchSpy)).toMatchObject({
			kind: 'investment',
			institution_name: 'Example Brokerage',
			account_name: 'Roth IRA',
			tier: 'TaxAdvantaged',
			employer: 'EmployerA',
			labels: ['Roth 401k']
		});
	});

	it('scopes a deduction to every employer when none is picked', async () => {
		const fetchSpy = flow({ employers: ['EmployerA'] });

		await pickKind('Deduction');
		await type('New deduction name', 'Dental');
		await toReview();
		await add();

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		expect(posted(fetchSpy)).toEqual({ kind: 'deduction', name: 'Dental', employer: null });
	});

	it('lists every answer, and sends the user back to the one that is wrong', async () => {
		flow();

		await pickKind('Bank');
		await type('Institution', 'Bank of Example');
		await toReview();

		expect(screen.getByText('Bank of Example')).toBeInTheDocument();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[1]!);

		expect(screen.getByText('Who holds it?')).toBeInTheDocument();
		expect(screen.getByLabelText('Institution')).toHaveValue('Bank of Example');
	});

	it('omits the date until one is picked, so the API dates it today', async () => {
		const fetchSpy = flow();

		await pickKind('Employer');
		await type('New employer name', 'Example Corp');
		await toReview();
		await add();

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		expect(posted(fetchSpy).date).toBeUndefined();
	});
});
