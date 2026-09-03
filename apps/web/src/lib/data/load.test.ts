import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// $app/paths.asset is a SvelteKit runtime helper; stub it to identity for tests.
vi.mock('$app/paths', () => ({ asset: (p: string) => p }));

import {
	data,
	deleteTransaction,
	enableEditMode,
	invalidateDerivedCache,
	loadState,
	getSettings,
	loadViewData,
	mode,
	networthAt,
	setSetting
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

describe('networthAt caching', () => {
	beforeEach(() => invalidateDerivedCache());

	it('fetches a date once and serves repeats from cache', async () => {
		const f = mockFetchOnce({ accounts: [], adjustments: [], logged: {} });
		vi.stubGlobal('fetch', f);

		await networthAt('2026-07-01');
		await networthAt('2026-07-01');
		expect(f).toHaveBeenCalledTimes(1);
	});

	it('caches each date separately', async () => {
		const f = mockFetchOnce({ accounts: [], adjustments: [], logged: {} });
		vi.stubGlobal('fetch', f);

		await networthAt('2026-07-01');
		await networthAt('2026-06-01');
		expect(f).toHaveBeenCalledTimes(2);
	});

	it('does not cache a failed read', async () => {
		vi.stubGlobal('fetch', mockFetchOnce({ detail: 'bad date' }, false, 422));
		expect(await networthAt('nope')).toBeNull();

		const ok = mockFetchOnce({ accounts: [], adjustments: [], logged: {} });
		vi.stubGlobal('fetch', ok);
		await networthAt('nope');
		expect(ok).toHaveBeenCalledTimes(1);
	});

	it('a write clears the cache, so the next read refetches', async () => {
		const first = mockFetchOnce({ accounts: [], adjustments: [], logged: {} });
		vi.stubGlobal('fetch', first);
		await networthAt('2026-07-01');

		// deleteTransaction goes through postJson, the single write choke point
		vi.stubGlobal('fetch', mockFetchOnce({ ok: true }));
		await deleteTransaction('id:x');

		const after = mockFetchOnce({ accounts: [], adjustments: [], logged: {} });
		vi.stubGlobal('fetch', after);
		await networthAt('2026-07-01');
		expect(after).toHaveBeenCalledTimes(1);
	});
});

describe('getSettings', () => {
	const body = { values: { swr: 4 }, specs: [{ key: 'swr' }] };

	it('returns the payload when the API answers', async () => {
		vi.stubGlobal('fetch', mockFetchOnce(body));
		const { info, error } = await getSettings();

		expect(error).toBeNull();
		expect(info?.values.swr).toBe(4);
	});

	it('tells the user to restart the API when the endpoint is missing', async () => {
		// A 404 here means the running API predates this build, not that a record is absent.
		vi.stubGlobal('fetch', mockFetchOnce({}, false, 404));
		const { info, error } = await getSettings();

		expect(info).toBeNull();
		expect(error).toContain('Restart');
		expect(error).toContain('serve-api');
	});

	it('reports an unreachable API distinctly from a missing endpoint', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
		const { error } = await getSettings();

		expect(error).toContain('unreachable');
		expect(error).not.toContain('Restart');
	});

	it('surfaces a rejected value as the API worded it', async () => {
		vi.stubGlobal(
			'fetch',
			mockFetchOnce({ detail: 'Withdrawal rate must be between 0.1 and 20' }, false, 422)
		);
		expect(await setSetting('swr', 99)).toBe('Withdrawal rate must be between 0.1 and 20');
	});
});
