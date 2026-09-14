import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// $app/paths.asset is a SvelteKit runtime helper; stub it to identity for tests.
vi.mock('$app/paths', () => ({ asset: (p: string) => p }));

import {
	accounts,
	API_UNAVAILABLE,
	closeAccount,
	type CloseOptions,
	data,
	deleteTransaction,
	invalidateDerivedCache,
	live,
	loadData,
	loadState,
	getSettings,
	networthAt,
	openAccount,
	setSetting,
	setSweep
} from '$lib/data/load';
import { makeAccounts, makeData } from '$lib/data/__fixtures__/dashboard';

/**
 * A fetch stub that answers per URL. The loader tries the API first and the snapshot second, so
 * which of the two answered is the thing under test in most of these — a single canned response
 * can't express that.
 */
function routed(routes: Record<string, unknown>, missing: string[] = []) {
	return vi.fn((url: string) => {
		if (missing.some((m) => url.includes(m))) return Promise.reject(new Error('unreachable'));
		const key = Object.keys(routes).find((k) => url.includes(k));
		if (!key) return Promise.reject(new Error(`no route for ${url}`));
		return Promise.resolve({
			ok: true,
			status: 200,
			statusText: 'OK',
			json: async () => routes[key]
		});
	});
}

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
	accounts.set(null);
	live.set(false);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('loadData', () => {
	it('prefers the local API, and reports itself live', async () => {
		const lists = makeAccounts({ spending_categories: ['Grocery'] });
		vi.stubGlobal('fetch', routed({ '/api/data': makeData(), '/api/accounts': lists }));

		await loadData();

		expect(get(loadState).status).toBe('ready');
		expect(get(live)).toBe(true);
		expect(get(accounts)?.spending_categories).toEqual(['Grocery']);
	});

	it('falls back to the snapshot when there is no API, and reports itself NOT live', async () => {
		const doc = makeData();
		doc.account_lists = makeAccounts({ spending_categories: ['FromSnapshot'] });
		vi.stubGlobal('fetch', routed({ 'data.json': doc }, ['/api/']));

		await loadData();

		expect(get(loadState).status).toBe('ready');
		expect(get(live)).toBe(false);
		// The account lists come from the snapshot, so the forms still have something to pick from.
		expect(get(accounts)?.spending_categories).toEqual(['FromSnapshot']);
	});

	it('falls back when the API answers with a document this build cannot read', async () => {
		const bad = makeData();
		(bad as { schema_version: number }).schema_version = 99;
		vi.stubGlobal('fetch', routed({ '/api/data': bad, 'data.json': makeData() }));

		await loadData();

		expect(get(loadState).status).toBe('ready');
		expect(get(live)).toBe(false);
	});

	it('stays live when the API serves the document but not the account lists', async () => {
		// An older API on the port: it can still take writes, so liveness must not hinge on the lists.
		const doc = makeData();
		doc.account_lists = makeAccounts({ spending_categories: ['FromSnapshot'] });
		vi.stubGlobal('fetch', routed({ '/api/data': doc }, ['/api/accounts']));

		await loadData();

		expect(get(live)).toBe(true);
		expect(get(accounts)?.spending_categories).toEqual(['FromSnapshot']);
	});

	it('reports a schema-version mismatch in the SNAPSHOT as an error', async () => {
		const bad = makeData();
		(bad as { schema_version: number }).schema_version = 99;
		vi.stubGlobal('fetch', routed({ 'data.json': bad }, ['/api/']));

		await loadData();

		expect(get(loadState).status).toBe('error');
		expect(get(loadState).message).toContain('this file is v99');
	});

	it('reports an empty ledger (no month_keys) as an error', async () => {
		const empty = makeData();
		empty.meta.month_keys = [];
		vi.stubGlobal('fetch', routed({ 'data.json': empty }, ['/api/']));

		await loadData();

		expect(get(loadState).status).toBe('error');
		expect(get(loadState).message).toContain('No transactions');
	});

	it('surfaces a total failure as an error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
		await loadData();
		expect(get(loadState).status).toBe('error');
		expect(get(loadState).message).toContain('boom');
	});
});

describe('the write guard', () => {
	it('refuses every write before a request is made when the API is not live', async () => {
		const f = mockFetchOnce({ ok: true });
		vi.stubGlobal('fetch', f);
		live.set(false);

		expect(await deleteTransaction('id:x')).toBe(API_UNAVAILABLE);
		expect(f).not.toHaveBeenCalled();
	});
});

describe('deleteTransaction', () => {
	beforeEach(() => live.set(true));

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

describe('opening and closing accounts', () => {
	beforeEach(() => live.set(true));

	/**
	 * A write is followed by an account-list refresh, so the stub has to answer the refresh too —
	 * feeding it a bogus document would throw inside the directory subscriber.
	 */
	function stubWrite(reply: unknown) {
		const spy = vi.fn((url: string) => {
			const path = String(url);
			const answer = path.includes('/api/accounts')
				? makeAccounts()
				: path.includes('/api/data')
					? makeData()
					: reply;
			return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => answer });
		});
		vi.stubGlobal('fetch', spy);
		return spy;
	}

	const bodiesOf = (spy: ReturnType<typeof vi.fn>, url: string): unknown[] =>
		spy.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(init.body));

	const bodyOf = (spy: ReturnType<typeof vi.fn>, url: string) => bodiesOf(spy, url)[0];

	it('opens an account from a name typed as words, and reports what the API called it', async () => {
		const spy = stubWrite({ account: 'Expenses:GiftCards', name: 'Gift Cards' });

		expect(await openAccount('category', 'Gift Cards')).toEqual({
			account: 'Expenses:GiftCards',
			name: 'Gift Cards',
			error: null
		});
		// sent as typed: composing the leaf is the API's job, so the two can't disagree
		expect(bodyOf(spy, '/api/account')).toEqual({ kind: 'category', name: 'Gift Cards' });
	});

	it('sends the per-kind fields alongside the naming half', async () => {
		const spy = stubWrite({ account: 'Assets:Investments:Taxable:BrokerageA' });

		await openAccount(
			'investment',
			{ institution_name: 'Brokerage A' },
			{ tier: 'Taxable', employer: 'EmployerA', labels: ['OptionA'] }
		);

		expect(bodyOf(spy, '/api/account')).toEqual({
			kind: 'investment',
			institution_name: 'Brokerage A',
			tier: 'Taxable',
			employer: 'EmployerA',
			labels: ['OptionA']
		});
	});

	it('reports the API detail when an open is rejected', async () => {
		vi.stubGlobal('fetch', mockFetchOnce({ detail: 'account name must be 1-60' }, false, 422));

		expect(await openAccount('category', 'Bad Leaf')).toEqual({
			account: null,
			name: null,
			error: 'account name must be 1-60'
		});
	});

	it('closes an account with nothing but its name', async () => {
		const spy = stubWrite({ ok: true, moved: 0 });

		expect(await closeAccount('Expenses:Gifts')).toBeNull();
		expect(bodyOf(spy, '/api/account/close')).toEqual({ account: 'Expenses:Gifts' });
	});

	it('carries a destination for a money account', async () => {
		const spy = stubWrite({ ok: true, moved: 500 });

		expect(
			await closeAccount('Assets:Cash:BankA', { destination: 'Assets:Cash:BankB' })
		).toBeNull();
		expect(bodyOf(spy, '/api/account/close')).toEqual({
			account: 'Assets:Cash:BankA',
			destination: 'Assets:Cash:BankB'
		});
	});

	it('carries the split legs for an investment', async () => {
		const spy = stubWrite({ ok: true, moved: 1500 });
		const legs = [{ destination: 'Assets:Cash:BankA', amount: 1500 }];

		expect(await closeAccount('Assets:Investments:Taxable:BrokerageA', { legs })).toBeNull();
		expect(bodyOf(spy, '/api/account/close')).toEqual({
			account: 'Assets:Investments:Taxable:BrokerageA',
			legs
		});
	});

	// One route now answers for three operations, so its rejection has to stay the API's own words.
	const rejected: CloseOptions[] = [
		{},
		{ destination: 'Assets:Cash:BankB' },
		{ legs: [{ destination: 'Assets:Cash:BankB', amount: 1 }] }
	];

	it.each(rejected)('surfaces the API detail as worded, whatever was asked (%o)', async (opts) => {
		vi.stubGlobal('fetch', mockFetchOnce({ detail: 'legs must sum to 5000' }, false, 422));
		expect(await closeAccount('Assets:Cash:BankA', opts)).toBe('legs must sum to 5000');
	});

	it('sets a sweep destination and clears it', async () => {
		const spy = stubWrite({ ok: true });

		expect(await setSweep('Assets:Cash:BankA', 'Assets:Cash:BankB')).toBeNull();
		expect(await setSweep('Assets:Cash:BankA', null)).toBeNull();

		expect(bodiesOf(spy, '/api/account/sweep')).toEqual([
			{ account: 'Assets:Cash:BankA', dest: 'Assets:Cash:BankB' },
			{ account: 'Assets:Cash:BankA', dest: null }
		]);
	});
});

describe('networthAt caching', () => {
	beforeEach(() => {
		invalidateDerivedCache();
		live.set(true);
	});

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
	it('reads the SNAPSHOT when there is no API, so the form still renders', async () => {
		// The rule for every form: it renders either way, and only the write is refused. The specs come
		// from the same builder function the API serves, so the form cannot tell the two apart.
		const doc = makeData();
		doc.settings = { swr: 4, real_return: 5, retire_age: 60, runway_target: 6, birth_year: null };
		doc.setting_specs = [
			{
				key: 'swr',
				label: 'Withdrawal rate',
				kind: 'percent',
				min: 0.1,
				max: 20,
				default: 4,
				help: 'h'
			},
			// A HYPHENATED key, which is the case that matters: the contract has to spell the same key
			// with an underscore (a hyphen is not a legal field name), so reading `settings` straight
			// through populates only `swr` and leaves every other field blank.
			{
				key: 'real-return',
				label: 'Expected real return',
				kind: 'percent',
				min: 0,
				max: 15,
				default: 5,
				help: 'h'
			},
			{
				key: 'retire-age',
				label: 'Target retirement age',
				kind: 'age',
				min: 30,
				max: 90,
				default: 60,
				help: 'h'
			}
		];
		vi.stubGlobal('fetch', routed({ 'data.json': doc }, ['/api/']));
		await loadData();

		const { info, error } = await getSettings();

		expect(error).toBeNull();
		expect(info?.specs.map((s) => s.key)).toEqual(['swr', 'real-return', 'retire-age']);
		// Every spec the form renders has its value beside it, whatever its key looks like.
		expect(info?.values).toEqual({ swr: 4, 'real-return': 5, 'retire-age': 60 });
	});

	it('gives a spec the snapshot has no value for a null rather than dropping the field', async () => {
		const doc = makeData();
		doc.settings = { swr: 4, real_return: 5, retire_age: 60, runway_target: 6, birth_year: null };
		doc.setting_specs = [
			{
				key: 'birth-year',
				label: 'Birth year',
				kind: 'year',
				min: 1900,
				max: 2100,
				default: null,
				help: 'h'
			},
			{
				key: 'invented-later',
				label: 'Invented later',
				kind: 'percent',
				min: 0,
				max: 1,
				default: null,
				help: 'h'
			}
		];
		vi.stubGlobal('fetch', routed({ 'data.json': doc }, ['/api/']));
		await loadData();

		expect((await getSettings()).info?.values).toEqual({
			'birth-year': null,
			'invented-later': null
		});
	});

	it('says the snapshot is too old rather than showing a blank panel', async () => {
		const doc = makeData();
		doc.settings = { swr: 4, real_return: 5, retire_age: 60, runway_target: 6, birth_year: null };
		doc.setting_specs = null;
		vi.stubGlobal('fetch', routed({ 'data.json': doc }, ['/api/']));
		await loadData();

		const { info, error } = await getSettings();
		expect(info).toBeNull();
		expect(error).toContain('stale');
	});

	describe('with an API', () => {
		beforeEach(() => live.set(true));

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
			expect(error).toContain('reload');
		});

		it('reports an unreachable API distinctly from a missing endpoint', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
			const { error } = await getSettings();

			expect(error).toContain('unreachable');
			expect(error).not.toContain('reload');
		});

		it('surfaces a rejected value as the API worded it', async () => {
			vi.stubGlobal(
				'fetch',
				mockFetchOnce({ detail: 'Withdrawal rate must be between 0.1 and 20' }, false, 422)
			);
			expect(await setSetting('swr', 99)).toBe('Withdrawal rate must be between 0.1 and 20');
		});
	});
});
