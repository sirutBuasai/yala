// Where the money sits opens an account in Log balances: a drill-in, so it leaves the Year view for Month,
// at the month the balance it drew was logged in.

import { goto } from '$app/navigation';
import type { DashboardData } from '$lib/data/types';
import { latestSnapshotMonth } from '$lib/data/networth';
import { MONTH_PARAM } from '$lib/nav/focus';
import { pageOf } from '$lib/nav/pages';

/** The account Log balances opens at, by ledger path. */
export const ACCOUNT_PARAM = 'account';

/** Opens Log balances at the account a bar is labelled with; nothing when the label names none. */
export function openAccount(url: URL, data: DashboardData, label: string): void {
	const account = data.networth?.accounts.find((a) => a.label === label)?.account;
	const month = latestSnapshotMonth(data);
	if (!account || !month) return;
	const query = new URLSearchParams({ [MONTH_PARAM]: month, [ACCOUNT_PARAM]: account });
	void goto(`${pageOf(url.pathname)}?${query}`);
}
