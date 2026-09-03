import { describe, expect, it } from 'vitest';
import { resolveKinds } from '$lib/forms/EditModals.svelte';

// The switcher renders only when more than one kind is on offer, so the length of this result is
// what decides "straight into the form" vs "pick a type" — that's the behaviour worth pinning.
describe('resolveKinds', () => {
	const page = ['transaction', 'paycheck', 'transfer'] as const;

	it("offers the page's whole set when nothing is requested", () => {
		expect(resolveKinds(undefined, [...page])).toEqual([...page]);
	});

	it('narrows to a single kind, so the overlay opens straight into that form', () => {
		expect(resolveKinds('paycheck', [...page])).toEqual(['paycheck']);
	});

	it('keeps a requested subset, which still shows a switcher', () => {
		expect(resolveKinds(['paycheck', 'transfer'], [...page])).toEqual(['paycheck', 'transfer']);
	});

	it('drops requested kinds the page does not permit', () => {
		expect(resolveKinds(['paycheck', 'balance'], [...page])).toEqual(['paycheck']);
	});

	it("falls back to the page's set when the request is entirely disallowed", () => {
		expect(resolveKinds('balance', [...page])).toEqual([...page]);
	});

	it('preserves the requested order rather than the palette order', () => {
		expect(resolveKinds(['transfer', 'transaction'], [...page])).toEqual([
			'transfer',
			'transaction'
		]);
	});

	it('is a no-op for a page that already permits one kind', () => {
		expect(resolveKinds('transaction', ['transaction'])).toEqual(['transaction']);
		expect(resolveKinds(undefined, ['transaction'])).toEqual(['transaction']);
	});
});
