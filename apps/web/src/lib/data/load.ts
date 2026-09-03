// Data loading, mode detection, and schema-version guard.
//
// View mode (default, hosted): fetch the static ./data.json.
// Edit mode (local API reachable): use /api/data + /api/accounts.

import { writable } from 'svelte/store';
import { asset } from '$app/paths';
import { setAccountDirectory } from '$lib/data/directory.svelte';
import type { DashboardData } from '$lib/data/types';

const EXPECTED_SCHEMA = 1;

/** A selectable paycheck line item, scoped to an employer (or generic when employer is null). */
export interface PayrollOption {
	kind: 'deduction' | 'contribution';
	label: string;
	employer: string | null;
	account: string;
}

export interface AccountsInfo {
	spending_categories: string[];
	funding_accounts: string[];
	employers: string[];
	payroll_options: PayrollOption[];
	cash_accounts: string[];
	credit_accounts: string[];
	/** Active `Assets:Investments:*` accounts. Always sent by the API. */
	investment_accounts?: string[];
	/** Cash + investment accounts with an `Equity:Adjustments:*` plug (loggable balances). */
	balance_accounts?: string[];
	/** Active liability accounts. Snapshot-able, but verify-only: they have no plug, so a figure
	    that disagrees with the ledger is rejected rather than padded. */
	liability_accounts?: string[];
	/** Passthrough routing: account → its `sweep_to` destination. Always sent by the API. */
	sweeps?: Record<string, string>;
}

export type Mode = 'view' | 'edit';

export interface LoadState {
	status: 'loading' | 'ready' | 'error';
	message?: string;
}

export const data = writable<DashboardData | null>(null);
export const accounts = writable<AccountsInfo | null>(null);
export const mode = writable<Mode>('view');
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
 * string `detail`, but stay defensive: FastAPI's own default handler (or an unhandled path) returns
 * `detail` as a list of error objects, which must not surface as "[object Object]".
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

/** POST a JSON body and parse the response, normalizing errors into a `PostResult`.
 *
 * Every write is a POST to a verb-suffixed path (`/api/balance/update`, `/api/entry/delete`) rather
 * than a method on a resource, so there is no method to choose. */
export async function postJson<T = Record<string, unknown>>(
	url: string,
	body: unknown
): Promise<PostResult<T>> {
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = (await res.json().catch(() => ({}))) as T & { detail?: unknown };

		// Every write can move a derived balance, so this single choke point drops the read cache
		// rather than each caller having to remember to.
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

/** Load the static snapshot (view mode). Sets loadState accordingly. */
export async function loadViewData(): Promise<void> {
	loadState.set({ status: 'loading' });

	try {
		const doc = await fetchJson<DashboardData>(asset('/data.json'));
		const problem = checkSchema(doc);

		if (problem) {
			loadState.set({ status: 'error', message: problem });
			return;
		}

		data.set(doc);
		mode.set('view');
		accounts.set(null);
		loadState.set({ status: 'ready' });
	} catch (err) {
		loadState.set({
			status: 'error',
			message: `Could not load data.json (${(err as Error).message}). Run \`python -m yala.api\` or rebuild with \`python -m yala.builder\`.`
		});
	}
}

/**
 * Verify the local API is reachable and switch to edit mode.
 * Returns true on success; on failure the caller stays in view mode.
 */
export async function enableEditMode(): Promise<boolean> {
	try {
		const doc = await fetchJson<DashboardData>('/api/data');

		if (checkSchema(doc)) return false;

		data.set(doc);

		try {
			accounts.set(await fetchJson<AccountsInfo>('/api/accounts'));
		} catch {
			accounts.set(null);
		}

		mode.set('edit');
		loadState.set({ status: 'ready' }); // enableEditMode can be the primary loader on startup
		return true;
	} catch {
		return false;
	}
}

/** Leave edit mode and fall back to the static snapshot. */
export async function disableEditMode(): Promise<void> {
	await loadViewData();
}

/** Re-pull live data after a write in edit mode. */
export async function refreshEditData(): Promise<void> {
	invalidateDerivedCache();
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
 * Re-pull the account lists (after declaring a new deduction/contribution type).
 *
 * The document goes first, then the lists. Opening an account changes both, and the lists are what
 * put a new row on screen — refreshing them first would render that row for one frame before the
 * directory knew its display name, so it would flash its raw leaf.
 */
async function refreshAccounts(): Promise<void> {
	await refreshEditData();

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
 * How an account is to be named. Either a `leaf` written directly (categories, and the quick-add
 * inside an entry form), or the descriptive form the Manage panels use — the institution and account
 * name as a person writes them, which the API joins into the leaf so the two cannot disagree. The
 * aliases are the short forms, consulted only when the rendered name overruns the display budget.
 */
export interface AccountNaming {
	leaf?: string;
	institution?: string;
	account_name?: string;
	bank_alias?: string;
	account_alias?: string;
}

/**
 * What opening an account returns. `name` is the display name the API resolved — the only authority
 * on it, since the naming rule and its alias substitutions live server-side.
 */
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

/** One settable figure, as the API describes it. The form renders from this rather than restating
    labels, bounds, and help text that the backend already owns. */
export interface SettingSpec {
	key: string;
	label: string;
	kind: 'percent' | 'age' | 'year';
	min: number;
	max: number;
	default: number | null;
	help: string;
}

export interface SettingsInfo {
	values: Record<string, number | null>;
	specs: SettingSpec[];
}

/**
 * Effective settings plus their specs.
 *
 * Reports *why* it failed rather than just null: a 404 means the API is running code older than
 * this page (the endpoint doesn't exist yet), which needs a restart — a materially different fix
 * from the API being down, and one a bare "could not load" leaves the user guessing at.
 */
export async function getSettings(): Promise<{ info: SettingsInfo | null; error: string | null }> {
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
