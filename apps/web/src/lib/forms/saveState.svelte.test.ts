import { describe, expect, it } from 'vitest';
import { SaveState } from '$lib/forms/saveState.svelte';

describe('SaveState', () => {
	it('records a confirmation and reports success', async () => {
		const save = new SaveState();
		const ok = await save.run(async () => null, 'Saved.');

		expect(ok).toBe(true);
		expect(save.note).toBe('Saved.');
		expect(save.error).toBe('');
		expect(save.busy).toBe(false);
	});

	it('records the error and reports failure', async () => {
		const save = new SaveState();
		const ok = await save.run(async () => 'nope', 'Saved.');

		expect(ok).toBe(false);
		expect(save.error).toBe('nope');
		expect(save.note).toBe('');
	});

	it('is busy only while the action is in flight', async () => {
		const save = new SaveState();
		let seen: boolean | undefined;

		await save.run(async () => {
			seen = save.busy;
			return null;
		});

		expect(seen).toBe(true);
		expect(save.busy).toBe(false);
	});

	it('clears the previous outcome when run again', async () => {
		const save = new SaveState();
		await save.run(async () => 'first failure');
		await save.run(async () => null, 'now fine');

		expect(save.error).toBe('');
		expect(save.note).toBe('now fine');
	});

	it('does not strand the control busy when the action throws', async () => {
		const save = new SaveState();

		await expect(
			save.run(async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');

		expect(save.busy).toBe(false);
	});

	it('fail() reports without calling the API', () => {
		const save = new SaveState();
		save.note = 'stale';

		expect(save.fail('bad input')).toBe(false);
		expect(save.error).toBe('bad input');
		expect(save.note).toBe('');
	});

	it('reset() drops both messages', async () => {
		const save = new SaveState();
		await save.run(async () => 'problem');
		save.reset();

		expect(save.error).toBe('');
		expect(save.note).toBe('');
	});
});
