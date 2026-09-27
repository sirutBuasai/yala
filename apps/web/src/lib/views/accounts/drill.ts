// Where the money sits opens an account in Log balances: a drill-in, so it leaves the Year view for Month,
// at the month the balance it drew was logged in.

import type { DashboardData } from '$lib/data/types';
import { latestSnapshotMonth } from '$lib/data/networth';
import { drillTo } from '$lib/nav/drill';
import { MONTH_PARAM } from '$lib/nav/focus';
import { pageOf } from '$lib/nav/pages';

/** Opens Log balances at the account a bar is labelled with; nothing when the label names none. */
export function openAccount(url: URL, data: DashboardData, label: string): void {
	const account = data.networth?.accounts.find((a) => a.label === label)?.account;
	const month = latestSnapshotMonth(data);
	if (!account || !month) return;
	const query = new URLSearchParams({ [MONTH_PARAM]: month });
	void drillTo(`${pageOf(url.pathname)}?${query}`, { pane: 'balances', focus: account });
}
