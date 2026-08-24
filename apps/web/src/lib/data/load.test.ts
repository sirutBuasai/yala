import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// $app/paths.asset is a SvelteKit runtime helper; stub it to identity for tests.
vi.mock('$app/paths', () => ({ asset: (p: string) => p }));

import {
	data,
	deleteTransaction,
	enableEditMode,
	loadState,
	loadViewData,
	mode
} from '$lib/data/load';
import { makeData } from '$lib/data/__fixtures__/dashboard';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
	return vi.fn().mockResolvedValue({
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		json: async () => body
	});
}

beforeEach(() => {
	data.set(null);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('loadViewData', () => {
	it('loads a valid snapshot and marks state ready', async () => {
		vi.stubGlobal('fetch', mockFetchOnce(makeData()));
		await loadViewData();
		expect(get(loadState).status).toBe('ready');
		expect(get(mode)).toBe('view');
		expect(get(data)?.schema_version).toBe(1);
	});

	it('reports a schema-version mismatch as an error', async () => {
		const bad = makeData();
		(bad as { schema_version: number }).schema_version = 2;
		vi.stubGlobal('fetch', mockFetchOnce(bad));
		await loadViewData();
		expect(get(loadState).status).toBe('error');
		expect(get(loadState).message).toContain('schema v2');
	});

	it('reports an empty ledger (no month_keys) as an error', async () => {
		const empty = makeData();
		empty.meta.month_keys = [];
		vi.stubGlobal('fetch', mockFetchOnce(empty));
		await loadViewData();
		expect(get(loadState).status).toBe('error');
		expect(get(loadState).message).toContain('No transactions');
	});

	it('surfaces a network failure as an error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
		await loadViewData();
		expect(get(loadState).status).toBe('error');
		expect(get(loadState).message).toContain('boom');
	});
});

describe('enableEditMode', () => {
	it('switches to edit mode when the API and schema are good', async () => {
		vi.stubGlobal('fetch', mockFetchOnce(makeData()));
		expect(await enableEditMode()).toBe(true);
		expect(get(mode)).toBe('edit');
	});

	it('returns false and stays put when the API is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no api')));
		expect(await enableEditMode()).toBe(false);
	});
});

describe('deleteTransaction', () => {
	it('returns null on success', async () => {
		vi.stubGlobal('fetch', mockFetchOnce({ ok: true }));
		expect(await deleteTransaction('id:x')).toBeNull();
	});

	it('returns the API detail on failure', async () => {
		vi.stubGlobal('fetch', mockFetchOnce({ detail: 'no transaction found' }, false, 404));
		expect(await deleteTransaction('id:missing')).toBe('no transaction found');
	});

	it('returns a friendly message when the API is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
		expect(await deleteTransaction('id:x')).toContain('API unreachable');
	});
});
