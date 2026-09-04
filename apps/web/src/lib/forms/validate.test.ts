import { describe, expect, it } from 'vitest';
import {
	LEAF_MAX,
	problems,
	TEXT_MAX,
	validateLeaf,
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
});

describe('validateLeaf', () => {
	it("requires a name, using the caller's noun", () => {
		expect(validateLeaf('', 'category name')).toBe('Enter a category name.');
		expect(validateLeaf('', 'bank account name')).toBe('Enter a bank account name.');
	});

	it('accepts letters, numbers and hyphens', () => {
		expect(validateLeaf('BankA-Savings2', 'name')).toBeNull();
	});

	it('rejects a name with a colon, space, or other punctuation', () => {
		for (const bad of ['Assets:Cash', 'my account', 'caf\u00e9', 'a_b']) {
			expect(validateLeaf(bad, 'name')).toBe('Use only letters, numbers, or hyphens.');
		}
	});

	it('caps the length at what the ledger accepts', () => {
		expect(validateLeaf('A'.repeat(LEAF_MAX), 'name')).toBeNull();
		expect(validateLeaf('A'.repeat(LEAF_MAX + 1), 'name')).toBe(
			`Use at most ${LEAF_MAX} characters.`
		);
	});

	it('picks the article the noun needs', () => {
		expect(validateLeaf('', 'employer')).toBe('Enter an employer.');
	});
});

describe('validateName', () => {
	it('accepts words as a person writes them', () => {
		expect(validateName('Bank of Example', 'Institution')).toBeNull();
	});

	it('requires a value that composes to something', () => {
		expect(validateName('  ', 'Institution')).toBe('Institution is required.');
		expect(validateName('!!!', 'Institution')).toBe(
			'Institution needs at least one letter or number.'
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
			'Account short form needs at least one letter or number.'
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
