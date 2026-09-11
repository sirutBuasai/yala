// Data loading, liveness, and the schema-version guard.
//
// ONE read path, tried in order: the local API, else the static `data.json` the builder wrote. Both
// carry the same account lists, so every form renders either way, and whether a write can land is
// answered in one place (`postJson`). Liveness is a fact about the environment, not a mode to switch.

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

// Display names and institutions live in the document but are read by pure helpers with no access to a
// store. Synced here rather than at each `data.set`, so no loader can forget to.
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

/** A readable error message from a failed response. FastAPI's own default handler returns a list of
    error objects rather than our flattened string `detail`, and that must not surface as
    "[object Object]". */
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

/** POST a JSON body and parse the response, normalizing errors into a `PostResult`. */
export async function postJson<T = Record<string, unknown>>(
	url: string,
	body: unknown
): Promise<PostResult<T>> {
	// THE write guard, and the only one: every mutation is a POST through here. `status: 0` is the
	// same shape a network failure produces, so callers need no new branch.
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

		// Every write can move a derived balance, so the cache is dropped here, not in each caller.
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

/** Cache for reads the ledger derives rather than stores: paging months back and forth otherwise
    re-walks the ledger for figures that cannot have changed. */
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
 * Load the dashboard: the local API first, the built snapshot second. Liveness is re-established every
 * load, never remembered — persisting it made a transient failure permanent, since falling back once
 * while the API restarted meant no later load retried it.
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

/** Delete a ledger entry by locator. Resolves to an error message, or null on success. */
export async function deleteTransaction(locator: string): Promise<string | null> {
	return (await postJson('/api/entry/delete', { locator })).error;
}

/** Re-pull the document and then the account lists, in that order: the lists put a new row on
    screen, so refreshing them first would flash its raw leaf before the directory knew its name. */
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
export type CreatableAccountKind = 'category' | 'funding_cash' | 'funding_credit' | 'investment';

/**
 * How an account is to be named: a `leaf` written directly, or the descriptive form the API joins into
 * one. Aliases are short forms, used only when the rendered name overruns the display budget.
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

/** The fields only an investment account has; the API rejects them on any other kind. */
export interface InvestmentFields {
	subtree?: 'Taxable' | 'TaxAdvantaged';
	holds_shares?: boolean;
	employer?: string | null;
	labels?: string[];
}

/**
 * Open a ledger account of any kind and refresh the account lists so the new one appears
 * everywhere. A bare string names it by `leaf`; `extra` carries the investment-only fields.
 */
export async function openAccount(
	kind: CreatableAccountKind,
	naming: string | AccountNaming,
	extra: InvestmentFields = {}
): Promise<OpenedAccount> {
	const body = typeof naming === 'string' ? { leaf: naming } : naming;
	const { ok, data, error } = await postJson<{ account?: string; name?: string }>('/api/account', {
		kind,
		...body,
		...extra
	});
	if (!ok) return { account: null, name: null, error: error ?? 'add failed' };
	await refreshAccounts();
	return { account: data.account ?? null, name: data.name ?? null, error: null };
}

/** POST, refresh the account lists on success, and reduce the result to an error message or null. */
async function writeAccounts(url: string, body: unknown, fallback: string): Promise<string | null> {
	const { ok, error } = await postJson(url, body);
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? fallback);
}

/** A destination + USD amount leg of an investment retirement split. */
export interface DrainLeg {
	destination: string;
	amount: number;
}

/** What a close takes beyond the account, decided by the account itself: a money account may drain
    to a `destination`, an investment splits its value across `legs`, and either may be dated. */
export interface CloseOptions {
	destination?: string;
	legs?: DrainLeg[];
	date?: string;
}

/** Close an account and refresh the lists. Returns an error message, or null. */
export async function closeAccount(
	account: string,
	opts: CloseOptions = {}
): Promise<string | null> {
	return writeAccounts('/api/account/close', { account, ...opts }, 'close failed');
}

/** Set `account`'s sweep destination (or clear it when `dest` is null); returns an error, or null. */
export async function setSweep(account: string, dest: string | null): Promise<string | null> {
	return writeAccounts('/api/account/sweep', { account, dest }, 'sweep update failed');
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

/** Log a USD balance snapshot for a cash or investment account (pad + balance); share lots are
    reclassified to USD first. */
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

/** Edit a balance snapshot in place. Returns the (possibly upgraded) locator: editing a migrated
    assertion stamps an id on it, replacing its line handle. */
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
 * The settings the snapshot carries, in the shape the API serves. The re-keying is the reason this needs
 * a function: a setting's real key is hyphenated, which is not a legal field name, so the contract
 * spells the same keys with underscores and reading them straight through blanks every hyphenated one.
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

/** Effective settings plus their specs. Reports *why* it failed, because the reasons need different
    actions: a 404 from a live API means the running API predates this page and needs a restart. */
export async function getSettings(): Promise<{ info: SettingsInfo | null; error: string | null }> {
	// Checked before any request: a static host answers 404 for every path, which would otherwise read as
	// a stale API and tell the user to restart something that isn't running.
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
