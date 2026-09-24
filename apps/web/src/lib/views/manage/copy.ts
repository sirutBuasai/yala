// The Manage page's wording, in one file so the add flow and the edit pane cannot say the same thing
// two ways. Per-kind wording — what a kind is called, what its fields are labelled — lives in
// `kinds.ts`; wording shared with other pages lives in `$lib/copy`.

/** Field labels the add flow and the edit pane both use. */
export const INSTITUTION = 'Institution';
export const INSTITUTION_ALIAS = 'Institution alias';
export const NAME = 'Name';
export const TAX_TREATMENT = 'Tax treatment';
export const EMPLOYER = 'Employer';
export const SWEEPS_INTO = 'Sweeps into';
/** The employer picker's empty option where the kind is not payroll-only: the account applies whoever
    the employer is, which is not the same as having none. */
export const EVERY_EMPLOYER = 'Every employer';

/** Whether a card's bank app counts pending charges in its current balance. */
export const PENDING = {
	label: 'Current balance includes pending charges',
	yes: 'Includes pending charges',
	no: 'Excludes pending charges'
} as const;

/** The rename warning, generic on purpose: it is true of every part of every kind's name. */
export const RENAME_HINT = 'Renaming would also change every entry that mentions it.';

/** The contribution-option column, offered in the add flow and the edit pane alike. */
export const OPTIONS = {
	header: 'Payroll contribution options',
	add: '+ Option',
	noun: 'contribution option',
	placeholder: 'Roth 401k',
	hint: 'Each option allows you to select payroll contribution distribution.',
	distinct: 'Each contribution option must be different.'
} as const;

/** The questions the add flow asks. A card is issued rather than held, and its product half is a
    product rather than an account, so those two questions come in pairs. */
export const ADD = {
	kicker: 'New account',
	/** Stands in as the title until a kind is picked, since the title IS the kind. */
	untitled: 'Account selection',
	confirm: 'Add account',
	kind: {
		q: 'What are you adding?',
		sub: 'This decides the rest of the questions.',
		problem: 'Pick what you are adding.'
	},
	institution: {
		q: { card: 'Who issued it?', other: 'Who holds it?' },
		sub: 'Institution official name and its alias.'
	},
	product: {
		q: { card: 'What is the card product?', other: 'What is the account name?' },
		sub: {
			card: 'Credit card official product name and its alias.',
			other: 'Account official name and its alias.'
		}
	},
	tier: {
		q: 'What is the tax treatment of the investment?',
		sub: 'Where the account sits for tax purposes.',
		why: {
			Taxable: 'An individual brokerage account.',
			TaxAdvantaged: '401k, IRA, HSA, and tax-advantaged accounts.'
		}
	},
	pending: {
		q: "Does the card's current balance include pending charges?",
		sub: 'Current balance shown on the banking application used for balance reconciliation and verification.',
		why: {
			no: 'Pending charges appear only once they post. Most cards work this way.',
			yes: 'Pending charges count toward the balance as soon as they appear.'
		}
	},
	payroll: {
		q: "Does this account's contribution come from an employer?",
		sub: "Allows the account to be associated with an employer's payroll.",
		/** Declining the question. A kind that offers contribution options is declining a payroll link
		    outright; one that does not is saying the account applies whoever the employer is. */
		none: { labelled: 'No, this is a personal account', other: EVERY_EMPLOYER }
	}
} as const;

/** The questions the close flow asks, and the words its review reads with. */
export const CLOSE = {
	kicker: 'Close account',
	confirm: 'Close account',
	question: 'Close it?',
	sub: 'You can reopen the account at a later date.',
	owing: { q: 'Pay it off first' },
	where: {
		q: 'Transfer the closing account balance to one or more accounts',
		sub: 'To close the account, first transfer the remaining account balance to a different account.'
	},
	with: {
		q: 'What closes with it?',
		sub: 'Select account(s) to close along with the employer.'
	},
	/** Switching between one destination and several. Both ways stay reachable, so neither is a dead
	    end. */
	toOne: 'Transfer balance to a single account',
	toMany: 'Transfer balance to multiple accounts',
	addDestination: '+ Destination'
} as const;
