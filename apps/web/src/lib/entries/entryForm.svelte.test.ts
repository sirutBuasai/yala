import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/data/load', () => ({
	fetchEntry: async () => ({ entry: { payee: 'coffee', amount: 4 }, error: null }),
	postJson: async () => ({ ok: true, error: null }),
	entryAction: async () => null
}));

const { EntryForm } = await import('./entryForm.svelte');

describe('EntryForm', () => {
	it('always has something to save while adding', () => {
		const form = new EntryForm(
			'transaction',
			() => {},
			() => ({ payee: '' })
		);
		expect(form.dirty).toBe(true);
	});

	it('has nothing to save as an edit opens, and something once the body moves', async () => {
		let body = { locator: 'id:1', payee: '', amount: 0 };
		const form = new EntryForm(
			'transaction',
			() => {},
			() => body
		);
		await form.load('id:1', (e) => (body = { ...body, payee: e.payee, amount: e.amount }));
		expect(form.dirty).toBe(false);

		body = { ...body, payee: 'tea' };
		expect(form.dirty).toBe(true);
	});

	it('reports a refused save through its error, and saves nothing', async () => {
		const saved = vi.fn();
		const form = new EntryForm('transaction', saved, () => ({ payee: '' }));
		await form.save('Title is required.');
		expect(form.error).toBe('Title is required.');
		expect(saved).not.toHaveBeenCalled();
	});
});
