import { describe, expect, it } from 'vitest';
import {
	LEAF_MAX,
	problems,
	TEXT_MAX,
	validateLabel,
	validateName,
	validateOptionalName,
	validateRange,
	validateRows
} from '$lib/forms/validate';

describe('validateRows', () => {
	it('passes empty and fully-filled rows', () => {
		expect(validateRows([{ value: '', amount: null }], 'credit')).toBeNull();
		expect(validateRows([{ value: 'Assets:Cash:Wallet', amount: 10 }], 'credit')).toBeNull();
	});
	it('flags an amount with no type, and a non-positive amount', () => {
		expect(validateRows([{ value: '', amount: 10 }], 'credit')).toBe(
			'Pick a type for each credit.'
		);
		expect(validateRows([{ value: 'x', amount: 0 }], 'credit')).toBe(
			'Enter an amount greater than 0 for each credit.'
		);
	});
});

describe('problems', () => {
	it('is empty when everything passes', () => {
		expect(problems().require('x', 'Title').positive(5, 'Total bill').message()).toBe('');
	});

	it('merges missing required fields into one clause', () => {
		expect(problems().require('', 'Title').positive(null, 'Total bill').message()).toBe(
			'Title and Total bill are required.'
		);
	});

	it('uses "is" for a single missing field and an Oxford-style list for three', () => {
		expect(problems().require('', 'Title').message()).toBe('Title is required.');
		expect(problems().require('', 'A').require('', 'B').require('', 'C').message()).toBe(
			'A, B and C are required.'
		);
	});

	it('puts the required clause and each other problem on their own lines', () => {
		const msg = problems()
			.require('', 'Title')
			.positive(-1, 'Total bill')
			.add('Reimbursements exceed the bill.')
			.message();
		expect(msg).toBe(
			'Title is required.\nTotal bill must be greater than 0.\nReimbursements exceed the bill.'
		);
	});

	it('ignores null ad-hoc checks', () => {
		expect(problems().positive(5, 'Amount').add(null).message()).toBe('');
	});

	it('rejects a missing, zero, negative, or non-finite positive amount', () => {
		expect(problems().positive(null, 'Amount').message()).toBe('Amount is required.');
		expect(problems().positive(0, 'Amount').message()).toBe('Amount must be greater than 0.');
		expect(problems().positive(-5, 'Amount').message()).toBe('Amount must be greater than 0.');
		expect(problems().positive(Infinity, 'Amount').message()).toBe(
			'Amount must be greater than 0.'
		);
		expect(problems().positive(4.25, 'Amount').message()).toBe('');
	});

	it('lets a non-negative amount be zero but not missing or negative', () => {
		expect(problems().nonNegative(0, 'Balance').message()).toBe('');
		expect(problems().nonNegative(null, 'Balance').message()).toBe('Balance is required.');
		expect(problems().nonNegative(-1, 'Balance').message()).toBe('Balance must be 0 or more.');
	});

	it('lets a non-zero amount take either sign, but not zero or missing', () => {
		expect(problems().nonZero(-40, 'Total bill').message()).toBe('');
		expect(problems().nonZero(40, 'Total bill').message()).toBe('');
		expect(problems().nonZero(0, 'Total bill').message()).toBe('Total bill must be non-zero.');
		expect(problems().nonZero(null, 'Total bill').message()).toBe('Total bill is required.');
		expect(problems().nonZero(Infinity, 'Total bill').message()).toBe(
			'Total bill must be non-zero.'
		);
	});
});

describe('validateLabel', () => {
	it("requires a value, using the caller's noun, worded as every other empty field is", () => {
		expect(validateLabel('', 'contribution option')).toBe('Contribution option is required.');
	});

	it('accepts letters, digits and spaces, a label being shown as typed rather than composed', () => {
		expect(validateLabel('Roth 401k')).toBeNull();
		expect(validateLabel('After Tax 2')).toBeNull();
	});

	it('rejects a comma, which is what joins the labels an account offers', () => {
		expect(validateLabel('Roth,401k')).toBe('Contribution option cannot contain a comma.');
	});

	it('rejects punctuation, which no other name in the app allows either', () => {
		expect(validateLabel('Roth 401(k)')).toBe(
			'Contribution option can only contain letters, numbers and spaces.'
		);
	});

	// A label is stored as one comma-joined metadata value on a single ledger line, so whitespace
	// that ends a line cannot be treated as "just a space".
	it('rejects a newline or a tab, which would break the line its meta is written on', () => {
		const wrong = 'Contribution option can only contain letters, numbers and spaces.';
		expect(validateLabel('Roth\n401k')).toBe(wrong);
		expect(validateLabel('Roth\t401k')).toBe(wrong);
	});

	it('caps the length at what the ledger accepts', () => {
		expect(validateLabel('A'.repeat(LEAF_MAX))).toBeNull();
		expect(validateLabel('A'.repeat(LEAF_MAX + 1))).toBe(
			`Contribution option must be at most ${LEAF_MAX} characters.`
		);
	});
});

describe('validateName', () => {
	it('accepts words as a person writes them', () => {
		expect(validateName('Bank of Example', 'Institution')).toBeNull();
	});

	it('requires a value, and one the composer will not silently shorten', () => {
		expect(validateName('  ', 'Institution')).toBe('Institution is required.');
		expect(validateName('!!!', 'Institution')).toBe(
			'Institution can only contain letters, numbers and spaces.'
		);
		expect(validateName('!Test', 'Institution')).toBe(
			'Institution can only contain letters, numbers and spaces.'
		);
	});

	it('caps the length', () => {
		expect(validateName('A'.repeat(TEXT_MAX + 1), 'Institution')).toBe(
			`Institution must be at most ${TEXT_MAX} characters.`
		);
	});
});

describe('validateOptionalName', () => {
	it('passes a blank value but still checks a filled one', () => {
		expect(validateOptionalName('   ', 'Account short form')).toBeNull();
		expect(validateOptionalName('!!', 'Account short form')).toBe(
			'Account short form can only contain letters, numbers and spaces.'
		);
	});
});

describe('validateRange', () => {
	it('accepts a value inside the range', () => {
		expect(validateRange(4, 'Withdrawal rate', 0.1, 20)).toBeNull();
	});

	it('rejects a missing or non-finite value', () => {
		expect(validateRange(null, 'Rate', 0, 10)).toBe('Rate must be a number.');
		expect(validateRange(Number.NaN, 'Rate', 0, 10)).toBe('Rate must be a number.');
	});

	it('rejects a value outside the bounds, naming them', () => {
		expect(validateRange(99, 'Rate', 0.1, 20)).toBe('Rate must be between 0.1 and 20.');
		expect(validateRange(0, 'Rate', 0.1, 20)).toBe('Rate must be between 0.1 and 20.');
	});

	it('rejects a fraction only when a whole number is required', () => {
		expect(validateRange(55.5, 'Age', 18, 100, true)).toBe('Age must be a whole number.');
		expect(validateRange(55.5, 'Rate', 18, 100)).toBeNull();
	});
});
