// Data loading, liveness, and the schema-version guard.
//
// ONE read path, tried in order: the local API, else the static `data.json` the builder wrote.
// There is no view-only mode and no edit toggle — whether the API answered is a FACT about the
// environment, not a mode the user chooses, so it is reported (`live`) rather than switched.
//
// Both sources carry the same account lists (the API serves them, the builder snapshots them from
// the same function), so every form and every Manage panel renders either way. What differs is
// whether a write can land, and that is answered in exactly one place: `postJson`.

import { get, writable } from 'svelte/store';
import { asset } from '$app/paths';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import type { AccountLists, DashboardData, SchemaVersion, SettingField } from '$lib/data/types';

// Typed as the contract's own version (types.ts is generated from schema.py), so bumping the schema
// makes this line a compile error rather than a stale runtime comparison.
const EXPECTED_SCHEMA: SchemaVersion = 1;

/** The pickable account sets. Contract-generated, so it can't drift from what the backend sends. */
export type AccountsInfo = AccountLists;
export type PayrollOption = AccountLists['payroll_options'][number];

/** What every write says when there is no API to write to. */
export const API_UNAVAILABLE =
	'The local API is not running, so nothing can be saved. Start it with `make serve-api`.';

export interface LoadState {
	status: 'loading' | 'ready' | 'error';
	message?: string;
}

export const data = writable<DashboardData | null>(null);
export const accounts = writable<AccountsInfo | null>(null);
/** True when the document came from the local API, and so when writes can land. */
export const live = writable(false);
export const loadState = writable<LoadState>({ status: 'loading' });

// Account display names and institutions live in the document, but are read by pure helpers
// (`formatAccount`, `accountVar`) that have no access to a store. Syncing here rather than at each
// `data.set` means a future loader can't forget to, and the directory can never describe a document
// that is no longer loaded.
data.subscribe((doc) => setAccountDirectory(doc?.meta.accounts));

function checkSchema(doc: DashboardData): string | null {
	if (doc.schema_version !== EXPECTED_SCHEMA) {
		return `data.json is schema v${doc.schema_version} but this app expects v${EXPECTED_SCHEMA}. Rebuild it with \`python -m yala.builder\`.`;
	}

	if (!doc.meta.month_keys.length) {
		return 'No transactions in the ledger yet. Add some, then rebuild with `python -m yala.builder`.';
	}

	return null;
}

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { cache: 'no-store' });

	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

	return res.json() as Promise<T>;
}

export interface PostResult<T> {
	ok: boolean;
	data: T;
	/** A user-facing message on failure (API detail, status, or a network error), else null. */
	error: string | null;
	/** HTTP status, or 0 when the request never reached the API. Lets a caller tell a missing
	    endpoint (a stale server) from a rejected request or an unreachable one. */
	status: number;
}

/**
 * A readable error message from a failed API response. The API flattens validation failures into a
 * string `detail`, but FastAPI's own default handler returns a list of error objects, which must not
 * surface as "[object Object]".
 */
function errorMessage(data: { detail?: unknown }, status: number): string {
	const d = data.detail;
	if (typeof d === 'string' && d) return d;
	if (Array.isArray(d)) {
		const parts = d.map((e) => (e && typeof e === 'object' && 'msg' in e ? String(e.msg) : ''));
		const joined = parts.filter(Boolean).join('; ');
		if (joined) return joined;
	}
	return `error ${status}`;
}

/** GET + parse JSON, normalizing errors into a `PostResult` (used to prefill edit forms). */
export async function getJson<T = Record<string, unknown>>(url: string): Promise<PostResult<T>> {
	try {
		const res = await fetch(url, { cache: 'no-store' });
		const data = (await res.json().catch(() => ({}))) as T & { detail?: unknown };

		return res.ok
			? { ok: true, data, error: null, status: res.status }
			: { ok: false, data, error: errorMessage(data, res.status), status: res.status };
	} catch (e) {
		return {
			ok: false,
			data: {} as T,
			error: 'API unreachable: ' + (e as Error).message,
			status: 0
		};
	}
}

/** POST a JSON body and parse the response, normalizing errors into a `PostResult`. Every write is
 *  a POST to a verb-suffixed path, so there is no method to choose. */
export async function postJson<T = Record<string, unknown>>(
	url: string,
	body: unknown
): Promise<PostResult<T>> {
	// THE write guard, and the only one. Every mutation in the app is a POST through here, so one
	// check answers for all of them — before any request goes out, and without each caller having to
	// remember to ask. `status: 0` is the same shape a network failure produces, so callers need no
	// new branch either.
	if (!get(live)) {
		return { ok: false, data: {} as T, error: API_UNAVAILABLE, status: 0 };
	}

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = (await res.json().catch(() => ({}))) as T & { detail?: unknown };

		// Every write can move a derived balance, so the read cache is dropped here rather than in
		// each caller.
		if (res.ok) invalidateDerivedCache();

		return res.ok
			? { ok: true, data, error: null, status: res.status }
			: { ok: false, data, error: errorMessage(data, res.status), status: res.status };
	} catch (e) {
		return {
			ok: false,
			data: {} as T,
			error: 'API unreachable: ' + (e as Error).message,
			status: 0
		};
	}
}

/**
 * Cache for reads the ledger derives rather than stores. `/api/networth` is fetched twice per
 * month on Home (this month's snapshot date and the previous one) and again on every month step, so
 * paging back and forth otherwise re-walks the ledger for figures that cannot have changed.
 */
const derivedCache = new Map<string, unknown>();

/** Drop every cached derived read. Called from the write path; exported for tests. */
export function invalidateDerivedCache(): void {
	derivedCache.clear();
}

/** Publish a validated document and the account lists that came with it. */
function publish(doc: DashboardData, fromApi: boolean, lists: AccountsInfo | null): void {
	data.set(doc);
	accounts.set(lists ?? doc.account_lists ?? null);
	live.set(fromApi);
	loadState.set({ status: 'ready' });
}

/**
 * Load the dashboard: the local API first, the built snapshot second.
 *
 * Tried in that order rather than offered as a choice. A previous version persisted which one the
 * user had "chosen", which made a transient failure permanent — load the page while the API is
 * restarting, fall back, and every later load took the "they chose the snapshot" branch and never
 * retried. Liveness is re-established on every load instead.
 */
export async function loadData(): Promise<void> {
	loadState.set({ status: 'loading' });

	try {
		const doc = await fetchJson<DashboardData>('/api/data');
		if (!checkSchema(doc)) {
			let lists: AccountsInfo | null = null;
			try {
				lists = await fetchJson<AccountsInfo>('/api/accounts');
			} catch {
				// The API answered for the document but not for the lists (an older build). Its
				// snapshot of them is the next best thing.
			}
			publish(doc, true, lists);
			return;
		}
	} catch {
		// No API on this port. Expected on a hosted copy; the snapshot is the answer.
	}

	try {
		const doc = await fetchJson<DashboardData>(asset('/data.json'));
		const problem = checkSchema(doc);
		if (problem) {
			loadState.set({ status: 'error', message: problem });
			return;
		}
		publish(doc, false, null);
	} catch (err) {
		loadState.set({
			status: 'error',
			message: `Could not load data.json (${(err as Error).message}). Rebuild it with \`python -m yala.builder\`, or start the API with \`make serve-api\`.`
		});
	}
}

/** Re-pull the document after a write. No-op when there is no API to pull from. */
export async function refreshData(): Promise<void> {
	invalidateDerivedCache();
	if (!get(live)) return;
	try {
		data.set(await fetchJson<DashboardData>('/api/data'));
	} catch {
		/* keep the last-known data */
	}
}

/**
 * Delete a ledger entry (transaction or paycheck) by locator. Resolves to an
 * error message on failure, or null on success.
 */
export async function deleteTransaction(locator: string): Promise<string | null> {
	return (await postJson('/api/entry/delete', { locator })).error;
}

/**
 * Re-pull the document and then the account lists, in that order. The lists are what put a new row on
 * screen, so refreshing them first would flash its raw leaf before the directory knew its name.
 */
async function refreshAccounts(): Promise<void> {
	await refreshData();
	if (!get(live)) return;

	try {
		accounts.set(await fetchJson<AccountsInfo>('/api/accounts'));
	} catch {
		/* keep the last-known accounts */
	}
}

/** A kind of account the API can open on demand (the leaf is appended under the kind's prefix). */
export type CreatableAccountKind =
	'category' | 'deduction' | 'contribution' | 'funding_credit' | 'funding_cash';

/**
 * How an account is to be named: either a `leaf` written directly, or the descriptive form the Manage
 * panels use — institution and account name as a person writes them, which the API joins into the
 * leaf. The aliases are short forms, used only when the rendered name overruns the display budget.
 */
export interface AccountNaming {
	leaf?: string;
	institution?: string;
	account_name?: string;
	bank_alias?: string;
	account_alias?: string;
}

/** What opening an account returns. `name` is the display name the API resolved, which is the only
    authority on it: the naming rule lives server-side. */
export interface OpenedAccount {
	account: string | null;
	name: string | null;
	error: string | null;
}

/**
 * Open a new ledger account (spending category or funding account) and refresh the account lists
 * so the new one appears everywhere. A bare string is shorthand for `{ leaf }`.
 */
export async function addAccount(
	kind: CreatableAccountKind,
	naming: string | AccountNaming
): Promise<OpenedAccount> {
	const body = typeof naming === 'string' ? { leaf: naming } : naming;
	const { ok, data, error } = await postJson<{ account?: string; name?: string }>('/api/account', {
		kind,
		...body
	});
	if (!ok) return { account: null, name: null, error: error ?? 'add failed' };
	await refreshAccounts();
	return { account: data.account ?? null, name: data.name ?? null, error: null };
}

/** Close an account by full name and refresh the lists. Returns an error message, or null. */
export async function closeAccount(account: string): Promise<string | null> {
	const { ok, error } = await postJson('/api/account/close', { account });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'close failed');
}

/** Set `account`'s sweep destination (or clear it when `dest` is null); returns an error, or null. */
export async function setSweep(account: string, dest: string | null): Promise<string | null> {
	const { ok, error } = await postJson('/api/account/sweep', { account, dest });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'sweep update failed');
}

/** Move an account's balance to `destination`, then close it; returns an error, or null. */
export async function drainCloseAccount(
	account: string,
	destination: string
): Promise<string | null> {
	const { ok, error } = await postJson('/api/account/drain-close', { account, destination });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'drain-close failed');
}

/** A destination + USD amount leg of an investment retirement split. */
export interface DrainLeg {
	destination: string;
	amount: number;
}

/** Open an investment account (Taxable or TaxAdvantaged), then refresh the lists; returns an error, or null. */
export async function addInvestment(
	body: {
		subtree: 'Taxable' | 'TaxAdvantaged';
		holds_shares: boolean;
		employer?: string | null;
		labels?: string[];
	} & AccountNaming
): Promise<OpenedAccount> {
	const { ok, data, error } = await postJson<{ account?: string; name?: string }>(
		'/api/investment',
		body
	);
	if (!ok) return { account: null, name: null, error: error ?? 'add failed' };
	await refreshAccounts();
	return { account: data.account ?? null, name: data.name ?? null, error: null };
}

/** Current USD value of an account's holdings (for prefilling the retirement split). */
export async function investmentValue(
	account: string
): Promise<{ value: number | null; error: string | null }> {
	const { ok, data, error } = await getJson<{ value?: number }>(
		`/api/investment/value?account=${encodeURIComponent(account)}`
	);
	return ok ? { value: data.value ?? 0, error: null } : { value: null, error: error ?? 'failed' };
}

/** Split an investment account's USD value across `legs`, then close it; returns an error, or null. */
export async function closeInvestment(account: string, legs: DrainLeg[]): Promise<string | null> {
	const { ok, error } = await postJson('/api/investment/close', { account, legs });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'retire failed');
}

/**
 * Log a USD balance snapshot for a cash or investment account (pad + balance). Share lots are
 * reclassified to USD first. Returns an error message, or null on success.
 */
export async function logBalance(
	account: string,
	amount: number,
	date?: string
): Promise<{ locator: string | null; error: string | null }> {
	const { ok, data, error } = await postJson<{ locator?: string }>('/api/balance', {
		account,
		amount,
		date: date || undefined
	});
	return ok
		? { locator: data.locator ?? null, error: null }
		: { locator: null, error: error ?? 'log failed' };
}

/**
 * Edit an existing balance snapshot in place, addressed by its locator. Returns the (possibly
 * upgraded) locator — editing a migrated assertion stamps an id on it, replacing its line handle.
 */
export async function updateBalance(
	locator: string,
	amount: number
): Promise<{ locator: string | null; error: string | null }> {
	const { ok, data, error } = await postJson<{ locator?: string }>('/api/balance/update', {
		locator,
		amount
	});
	return ok
		? { locator: data.locator ?? locator, error: null }
		: { locator: null, error: error ?? 'edit failed' };
}

/** Per-account USD values + adjustment plugs as of a date (for the month-aware balance pane). */
export interface NetWorthAt {
	accounts: { account: string; value: number }[];
	adjustments: { account: string; value: number }[];
	/** account -> locator, only where that date already holds an editable USD assertion. */
	logged: Record<string, string>;
}

export async function networthAt(date: string): Promise<NetWorthAt | null> {
	const key = `networth:${date}`;
	const cached = derivedCache.get(key) as NetWorthAt | undefined;
	if (cached) return cached;

	const { ok, data } = await getJson<NetWorthAt>(`/api/networth?date=${encodeURIComponent(date)}`);
	if (ok) derivedCache.set(key, data);

	return ok ? data : null;
}

// --- settings ---

/** One settable figure, as the backend describes it. Contract-generated, so the form renders from
    the labels, bounds and help text the backend already owns rather than restating them. */
export type SettingSpec = SettingField;

export interface SettingsInfo {
	values: Record<string, number | null>;
	specs: SettingSpec[];
}

/**
 * The settings the snapshot carries, in the same shape the API serves, so the form cannot tell the
 * two apart.
 *
 * The re-keying is the whole reason this needs a function. A setting's real key is hyphenated
 * (`real-return`) because that is how it reads as a word in the ledger, and that is what the specs
 * and the write endpoint use — but a hyphen is not a legal field name, so the CONTRACT spells the
 * same keys with underscores. Reading `settings` straight through therefore populates only `swr`, the
 * one key with no hyphen in it, and every other field silently renders blank.
 */
function snapshotSettings(): SettingsInfo | null {
	const doc = get(data);
	if (!doc?.settings || !doc.setting_specs) return null;

	const stored = doc.settings as unknown as Record<string, number | null | undefined>;
	// Keyed off the specs, so a setting can never appear in the form without a value beside it.
	const values = Object.fromEntries(
		doc.setting_specs.map((spec) => [spec.key, stored[spec.key.replaceAll('-', '_')] ?? null])
	);
	return { values, specs: doc.setting_specs };
}

/**
 * Effective settings plus their specs. Reports *why* it failed rather than just null, because the
 * remaining reasons need different actions: a 404 from a live API means the running API predates
 * this page and needs a restart; anything else is the API's own words.
 */
export async function getSettings(): Promise<{ info: SettingsInfo | null; error: string | null }> {
	// No API: read the snapshot's own copy, so the form renders and reads correctly. Same rule as
	// every other form — everything renders, and only the WRITE is refused (by the one guard in
	// `postJson`). Checked first, because a static host answers 404 for every path and that would
	// otherwise read as a stale API and tell the user to restart something that isn't running.
	if (!get(live)) {
		const info = snapshotSettings();
		return info
			? { info, error: null }
			: {
					info: null,
					error:
						'This `data.json` predates the settings form. Rebuild it with `python -m yala.builder`, or start the API with `make serve-api`.'
				};
	}

	const { ok, data, error, status } = await getJson<SettingsInfo>('/api/settings');
	if (ok) return { info: data, error: null };

	const hint =
		status === 404
			? 'This build expects a /api/settings endpoint the running API does not have. Restart it (`make serve-api`) to pick up the current backend.'
			: (error ?? 'could not load settings');
	return { info: null, error: hint };
}

/** Set one setting; returns an error message, or null on success. */
export async function setSetting(key: string, value: number): Promise<string | null> {
	const { ok, error } = await postJson('/api/settings', { key, value });
	return ok ? null : (error ?? 'could not save setting');
}
