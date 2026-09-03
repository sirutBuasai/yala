// `seed` is the rule that keeps a remembered choice from outliving the thing it names: every form
// resolves its sticky preference through here, so a closed account can't leave a select empty.

import { describe, expect, it } from 'vitest';
import { seed } from '$lib/utils/editPrefs';

describe('seed', () => {
	it('keeps the remembered choice when it is still on offer', () => {
		expect(seed('Takeouts', ['Grocery', 'Takeouts'])).toBe('Takeouts');
	});

	it('falls back to the first option when the remembered one is gone', () => {
		expect(seed('Takeouts', ['Grocery', 'Housing'])).toBe('Grocery');
	});

	it('falls back when nothing was remembered', () => {
		expect(seed('', ['Grocery'])).toBe('Grocery');
	});

	it('returns empty when there is nothing to offer', () => {
		expect(seed('Takeouts', [])).toBe('');
	});
});
