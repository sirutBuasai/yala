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
