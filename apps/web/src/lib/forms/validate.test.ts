import { describe, expect, it } from 'vitest';
import { problems, requirePositive, validateRows } from '$lib/forms/validate';

describe('requirePositive', () => {
	it('rejects null, zero, negative, and non-finite amounts', () => {
		expect(requirePositive(null, 'Amount')).toBe('Amount is required.');
		expect(requirePositive(0, 'Amount')).toBe('Amount must be greater than 0.');
		expect(requirePositive(-5, 'Amount')).toBe('Amount must be greater than 0.');
		expect(requirePositive(Infinity, 'Amount')).toBe('Amount must be greater than 0.');
		expect(requirePositive(4.25, 'Amount')).toBeNull();
	});
});

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
});
