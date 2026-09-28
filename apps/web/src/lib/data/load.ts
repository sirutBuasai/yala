// One read path: the local API, else the static `data.json` the builder wrote. Both carry the account
// lists, so every form renders either way; only `postJson` decides whether a write can land.

import { get, writable } from 'svelte/store';
import { asset } from '$app/paths';
import { setAccountDirectory, type ColorFamily } from '$lib/data/directory.svelte';
import type { AccountLists, DashboardData, SchemaVersion, SettingField } from '$lib/data/types';
import { settingField } from '$lib/data/assumptions';
import { seedLayouts } from '$lib/data/layouts';

// Typed as the contract's own version, so bumping the schema breaks this line at compile time.
const EXPECTED_SCHEMA: SchemaVersion = 1;

/** The pickable account sets, as the contract generates them. */
export type AccountsInfo = AccountLists;
export type PayrollOption = AccountLists['payroll_options'][number];

/** What every write says when there is no API to write to. */
export const API_UNAVAILABLE = 'Unable to write data: the app is in read-only mode.';

export interface LoadState {
	status: 'loading' | 'ready' | 'error';
	message?: string;
}

export const data = writable<DashboardData | null>(null);
export const accounts = writable<AccountsInfo | null>(null);
/** True when the document came from the local API, and so when writes can land. */
export const live = writable(false);
export const loadState = writable<LoadState>({ status: 'loading' });

// Synced from a subscriber rather than at each `data.set`, so no loader can forget to.
data.subscribe((doc) => setAccountDirectory(doc?.meta.accounts));

function checkSchema(doc: DashboardData): string | null {
	if (doc.schema_version !== EXPECTED_SCHEMA) {
		return `Data schema mismatch: this file is v${doc.schema_version} but the app expects v${EXPECTED_SCHEMA}.`;
	}

	if (!doc.meta.month_keys.length) {
		return 'No transactions currently recorded in the ledger.';
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
	/** HTTP status, or 0 when the request never reached the API. */
	status: number;
}

/** A readable message from a failed response. FastAPI's validation handler puts a list of error
    objects in `detail` rather than a string, which would otherwise surface as "[object Object]". */
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

/** Fetch + parse JSON, normalizing every failure mode into a `PostResult`. */
async function request<T>(url: string, init?: RequestInit): Promise<PostResult<T>> {
	try {
		const res = await fetch(url, { cache: 'no-store', ...init });
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

function getJson<T = Record<string, unknown>>(url: string): Promise<PostResult<T>> {
	return request<T>(url);
}

/** POST a JSON body. The one write choke point: the guard below is the only one in the app.
    `keepalive` lets the request outlive a page that is closing. */
export async function postJson<T = Record<string, unknown>>(
	url: string,
	body: unknown,
	{ keepalive = false } = {}
): Promise<PostResult<T>> {
	// `status: 0` is the shape a network failure produces, so callers need no new branch.
	if (!get(live)) {
		return { ok: false, data: {} as T, error: API_UNAVAILABLE, status: 0 };
	}

	const result = await request<T>(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		keepalive
	});
	// Every write can move a derived balance, so the cache is dropped here, not in each caller.
	if (result.ok) invalidateDerivedCache();

	return result;
}

/** Cache for reads the ledger derives rather than stores; cleared on every write. */
const derivedCache = new Map<string, unknown>();

/** Drop every cached derived read. Called from the write path; exported for tests. */
export function invalidateDerivedCache(): void {
	derivedCache.clear();
}

/** Publish a validated document and the account lists that came with it. */
function publish(doc: DashboardData, fromApi: boolean, lists: AccountsInfo | null): void {
	seedLayouts(doc.layouts);
	data.set(doc);
	accounts.set(lists ?? doc.account_lists ?? null);
	live.set(fromApi);
	loadState.set({ status: 'ready' });
}

/** Liveness is re-established every load, never persisted: remembering a fallback made a transient failure
    permanent. */
export async function loadData(): Promise<void> {
	loadState.set({ status: 'loading' });

	try {
		const doc = await fetchJson<DashboardData>('/api/data');
		if (!checkSchema(doc)) {
			let lists: AccountsInfo | null = null;
			try {
				lists = await fetchJson<AccountsInfo>('/api/accounts');
			} catch {
				// An older API answers for the document but not the lists; its snapshot of them will do.
			}
			publish(doc, true, lists);
			return;
		}
	} catch {
		// No API on this port. Expected on a hosted copy, where the snapshot is the answer.
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
			message: `Unable to load data (${(err as Error).message}).`
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

/** Re-pull the document, then the lists. Order matters: a list refreshed first flashes a raw leaf
    name, since the directory does not yet know the new account. */
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
	'category' | 'bank' | 'card' | 'investment' | 'employer' | 'deduction';

/** An investment's tax tier. A path segment, so changing it is a move, not a metadata edit. */
export type AccountTier = 'Taxable' | 'TaxAdvantaged';

/** The whole name, or two halves the API joins; words are sent as typed. Aliases apply only when a rendered
    name overruns. */
export interface AccountNaming {
	name?: string;
	institution_name?: string;
	account_name?: string;
	institution_alias?: string;
	account_alias?: string;
}

/** What opening an account returns. `name` is the API's resolved display name; the rule is server-side. */
export interface OpenedAccount {
	account: string | null;
	name: string | null;
	error: string | null;
}

/** Optional fields beyond a name. The API rejects one sent to a kind that has no room for it. */
export interface AccountExtras {
	date?: string;
	tier?: AccountTier;
	employer?: string | null;
	labels?: string[];
	includes_pending?: boolean;
}

/** Open an account and refresh the lists. A bare string is the name as typed. */
export async function openAccount(
	kind: CreatableAccountKind,
	naming: string | AccountNaming,
	extra: AccountExtras = {}
): Promise<OpenedAccount> {
	const body = typeof naming === 'string' ? { name: naming } : naming;
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

/** A money account may drain to a `destination`, an investment splits its value across `legs`. */
export interface CloseOptions {
	destination?: string;
	legs?: DrainLeg[];
	date?: string;
	/** Which of an employer's linked accounts close with it. Sent even when empty: the omitted ones are
	    unlinked, so the API refuses to guess. */
	close_with?: string[];
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

/** Rewrites the name across the whole ledger. `account` in the result is the new path, which only the API
    can spell. */
export async function renameAccount(
	account: string,
	change: {
		name?: string;
		institution_name?: string;
		account_name?: string;
		tier?: AccountTier;
	}
): Promise<{ account: string | null; error: string | null }> {
	const { ok, data, error } = await postJson<{ account?: string }>('/api/account/rename', {
		account,
		...change
	});
	if (!ok) return { account: null, error: error ?? 'rename failed' };
	await refreshAccounts();
	return { account: data.account ?? null, error: null };
}

/** Undo a close. Returns an error message, or null. */
export async function reopenAccount(account: string): Promise<string | null> {
	return writeAccounts('/api/account/reopen', { account }, 'reopen failed');
}

/** Only present keys change, null clearing one. Name halves go through `renameAccount`. */
export interface AccountMeta {
	institution_alias?: string | null;
	account_alias?: string | null;
	employer?: string | null;
	labels?: string[];
	includes_pending?: boolean;
}

export async function setAccountMeta(account: string, meta: AccountMeta): Promise<string | null> {
	return writeAccounts('/api/account/meta', { account, ...meta }, 'update failed');
}

/** Rename one contribution label, in what the account offers and in its logged history. */
export async function relabelAccount(
	account: string,
	old: string,
	next: string
): Promise<string | null> {
	return writeAccounts('/api/account/relabel', { account, old, new: next }, 'relabel failed');
}

/** Current USD value of an account's holdings. */
export async function investmentValue(
	account: string
): Promise<{ value: number | null; error: string | null }> {
	const { ok, data, error } = await getJson<{ value?: number }>(
		`/api/investment/value?account=${encodeURIComponent(account)}`
	);
	return ok ? { value: data.value ?? 0, error: null } : { value: null, error: error ?? 'failed' };
}

/** Set the colour an institution or category is drawn in; `null` drops the pick. */
export async function setColor(
	family: ColorFamily,
	name: string,
	color: string | null
): Promise<string | null> {
	return (await postJson('/api/color', { family, name, color })).error;
}

/** One account's figure in a sitting: typed as the statement reads, with the snapshot standing on
    the reading's date to correct in place, if there is one. */
export interface Reading {
	account: string;
	amount: number;
	locator?: string;
}

/** Save a whole sitting in one request. Share lots are reclassified to USD first. Each saved account
    maps to the locator of its snapshot, each refused one to why. */
export async function logBalances(
	date: string,
	readings: Reading[]
): Promise<{
	saved: Record<string, string>;
	failed: Record<string, string>;
	error: string | null;
}> {
	const { ok, data, error } = await postJson<{
		saved?: Record<string, string>;
		failed?: Record<string, string>;
	}>('/api/balances', { date, readings });
	return ok
		? { saved: data.saved ?? {}, failed: data.failed ?? {}, error: null }
		: { saved: {}, failed: {}, error: error ?? 'save failed' };
}

export interface LoggedSnapshot {
	date: string;
	amount: number;
	locator: string | null;
}

/** Per-account USD values and adjustment plugs as of a date. */
export interface NetWorthAt {
	/** Snapshot-able accounts as the MONTH had them, not as today has them: one opened later or
	    closed earlier is absent, and the month it opened or closed in still counts. */
	balance_accounts: string[];
	liability_accounts: string[];
	accounts: { account: string; value: number }[];
	adjustments: { account: string; value: number }[];
	/** Each account's snapshot as of the end of the date, for accounts snapshotted that month. `locator` only
	    where rewritable; `amount` as stored, so a liability's is negative. */
	standing: Record<string, LoggedSnapshot>;
	/** account -> its snapshot before the standing one, or before the reading where none stands. */
	previous: Record<string, LoggedSnapshot>;
	/** card -> what its bank app should read at the END of the date, as stored (owed negative), and
	    whether a reading then must match it rather than set the card's starting balance. */
	cards: Record<string, { expected: number; must_agree: boolean }>;
}

export async function networthAt(date: string): Promise<NetWorthAt | null> {
	const key = `networth:${date}`;
	const cached = derivedCache.get(key) as NetWorthAt | undefined;
	if (cached) return cached;

	const { ok, data } = await getJson<NetWorthAt>(`/api/networth?date=${encodeURIComponent(date)}`);
	if (ok) derivedCache.set(key, data);

	return ok ? data : null;
}

/** One settable figure, as the backend describes it — labels, bounds and help text included. */
export type SettingSpec = SettingField;

export interface SettingsInfo {
	values: Record<string, number | null>;
	specs: SettingSpec[];
}

/** The settings the snapshot carries, in the shape the API serves, re-keyed from `settingField`. */
function snapshotSettings(): SettingsInfo | null {
	const doc = get(data);
	if (!doc?.settings || !doc.setting_specs) return null;

	const stored = doc.settings as unknown as Record<string, number | null | undefined>;
	// Keyed off the specs, so a setting can never appear in the form without a value beside it.
	const values = Object.fromEntries(
		doc.setting_specs.map((spec) => [spec.key, stored[settingField(spec.key)] ?? null])
	);
	return { values, specs: doc.setting_specs };
}

/** Effective settings plus their specs. A 404 from a live API means the API predates this page. */
export async function getSettings(): Promise<{ info: SettingsInfo | null; error: string | null }> {
	// Checked before requesting: a static host 404s every path, which would read as a stale API.
	if (!get(live)) {
		const info = snapshotSettings();
		return info
			? { info, error: null }
			: {
					info: null,
					error: 'Data is stale. Please reload the app.'
				};
	}

	const { ok, data, error, status } = await getJson<SettingsInfo>('/api/settings');
	if (ok) return { info: data, error: null };

	const hint =
		status === 404
			? 'Unable to write data. Please reload the app.'
			: (error ?? 'could not load settings');
	return { info: null, error: hint };
}

/** The entry a locator names, for an edit form to prefill from. `entry` is undefined on failure. */
export async function fetchEntry(
	kind: 'transaction' | 'transfer' | 'paycheck',
	locator: string
): Promise<{ entry?: Record<string, any>; error?: string }> {
	const { ok, data, error } = await getJson<Record<string, any>>(
		`/api/${kind}?locator=${encodeURIComponent(locator)}`
	);
	return ok ? { entry: data } : { error: error ?? 'load failed' };
}

/** `null` puts the setting back on its default. Returns an error message, or null on success. */
export async function setSetting(key: string, value: number | null): Promise<string | null> {
	const { ok, error } = await postJson('/api/settings', { key, value });
	return ok ? null : (error ?? 'could not save setting');
}
