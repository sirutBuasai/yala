// Data loading, mode detection, and schema-version guard.
//
// View mode (default, hosted): fetch the static ./data.json.
// Edit mode (local API reachable): use /api/data + /api/accounts.

import { writable } from 'svelte/store';
import { asset } from '$app/paths';
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
			? { ok: true, data, error: null }
			: { ok: false, data, error: errorMessage(data, res.status) };
	} catch (e) {
		return { ok: false, data: {} as T, error: 'API unreachable: ' + (e as Error).message };
	}
}

/** POST a JSON body and parse the response, normalizing errors into a `PostResult`. */
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

		return res.ok
			? { ok: true, data, error: null }
			: { ok: false, data, error: errorMessage(data, res.status) };
	} catch (e) {
		return { ok: false, data: {} as T, error: 'API unreachable: ' + (e as Error).message };
	}
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
	return (await postJson('/api/transaction/delete', { locator })).error;
}

/** Re-pull the account lists (after declaring a new deduction/contribution type). */
export async function refreshAccounts(): Promise<void> {
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
 * Open a new ledger account (spending category or funding account) and refresh the account lists
 * so the new one appears everywhere. Returns the created full account name, or an error message.
 */
export async function addAccount(
	kind: CreatableAccountKind,
	leaf: string
): Promise<{ account: string | null; error: string | null }> {
	const { ok, data, error } = await postJson<{ account?: string }>('/api/account', { kind, leaf });
	if (!ok) return { account: null, error: error ?? 'add failed' };
	await refreshAccounts();
	return { account: data.account ?? leaf, error: null };
}

/**
 * Close an account by full name — a spending category (`Expenses:<leaf>`) or a bank account
 * (`Assets:Cash:<leaf>`) — and refresh the account lists so it drops out of the pickers. Returns
 * an error message on failure, or null on success.
 */
export async function closeAccount(account: string): Promise<string | null> {
	const { ok, error } = await postJson('/api/account/close', { account });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'close failed');
}

/**
 * Declare `account` as a passthrough that sweeps to `dest`, or clear it when `dest` is null.
 * Refreshes the account lists. Returns an error message on failure, or null on success.
 */
export async function setSweep(account: string, dest: string | null): Promise<string | null> {
	const { ok, error } = await postJson('/api/account/sweep', { account, dest });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'sweep update failed');
}

/**
 * Retire a balance-sheet account: move its balance to `destination`, then close it. Refreshes the
 * account lists. Returns an error message on failure, or null on success.
 */
export async function drainCloseAccount(
	account: string,
	destination: string
): Promise<string | null> {
	const { ok, error } = await postJson('/api/account/drain-close', { account, destination });
	if (ok) await refreshAccounts();
	return ok ? null : (error ?? 'drain-close failed');
}
