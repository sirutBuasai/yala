<script lang="ts">
	// "Log balances" — every loggable account on one screen, grouped the way the splits are tallied,
	// so a month's snapshot is one pass down the Balance column rather than ten separate steps.
	//
	// A month's snapshot is its FIRST-of-month assertion — the convention the whole ledger follows
	// (and the spreadsheet it was migrated from), where "July 2026" is the balance standing on
	// 2026-07-01.
	//
	// The columns exist to make a figure checkable before it is committed:
	//   Previous — what stood at the *previous* month's snapshot
	//   Expected — what the ledger computes for this one, before anything new is logged
	//   Change   — Balance − Previous, i.e. how much the account moved this month
	//   Check    — Balance − Expected, i.e. only the adjustment THIS month would post (not the
	//              running total), so an unlogged transfer shows up as its own figure
	//
	// Assets may legitimately drift (markets move), so their gap posts an `Equity:Adjustments:*`
	// plug. Liabilities have no plug: a card balance is fully determined by the spending and bill
	// payments already entered, so a gap means an entry is missing. Those rows block instead, and
	// "Save all" commits everything else and reports what it skipped.
	import type { DashboardData } from '$lib/data/types';
	import { type AccountsInfo, logBalance, networthAt, updateBalance } from '$lib/data/load';
	import { formatAccount, money, moneyExact } from '$lib/utils/format';
	import { accountVar } from '$lib/utils/theme';
	import { addMonths } from '$lib/utils/period';
	import Pane from '$lib/layout/Pane.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
		/** Selected month "YYYY-MM" — shared with the calendar via the header stepper. */
		monthKey: string;
	}
	let { data, accounts, edit, onsaved, monthKey }: Props = $props();

	type Group = 'Liquid' | 'Taxable' | 'Tax-advantaged' | 'Liabilities';
	const GROUP_ORDER: Group[] = ['Liquid', 'Taxable', 'Tax-advantaged', 'Liabilities'];

	interface Row {
		account: string;
		group: Group;
		liability: boolean;
	}

	/** Which split an account is tallied under, from its ledger path. */
	function groupOf(account: string): Group {
		if (account.startsWith('Liabilities:')) return 'Liabilities';
		if (account.startsWith('Assets:Investments:TaxAdvantaged')) return 'Tax-advantaged';
		if (account.startsWith('Assets:Investments:')) return 'Taxable';
		return 'Liquid';
	}

	const rows = $derived.by<Row[]>(() => {
		const assets = accounts?.balance_accounts ?? [];
		const liabilities = accounts?.liability_accounts ?? [];
		const all = [
			...assets.map((account) => ({ account, group: groupOf(account), liability: false })),
			...liabilities.map((account) => ({ account, group: 'Liabilities' as Group, liability: true }))
		];
		return all.sort(
			(a, b) =>
				GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
				formatAccount(a.account).localeCompare(formatAccount(b.account))
		);
	});

	/** First day of "YYYY-MM" as an ISO date — where a month's snapshot is asserted. Empty until the
	    parent has resolved a month, so the fetch below can skip that first render. */
	const firstDayOf = (key: string) => (key ? `${key}-01` : '');
	const shownDate = $derived(firstDayOf(monthKey));
	const prevDate = $derived(monthKey ? firstDayOf(addMonths(monthKey, -1)) : '');

	// Two reads: this month's snapshot date and the previous one. Their adjustment totals differ by
	// exactly what was plugged in between, which is what isolates this month's figure.
	let atNow = $state<Map<string, number>>(new Map());
	let adjNow = $state<Map<string, number>>(new Map());
	let adjPrev = $state<Map<string, number>>(new Map());
	let prevVals = $state<Map<string, number>>(new Map());
	let locators = $state<Map<string, string>>(new Map());
	let loading = $state(false);

	const toMap = (list: { account: string; value: number }[]) =>
		new Map(list.map((a) => [a.account, a.value]));

	async function refresh() {
		if (!shownDate || !prevDate) return;
		if (!edit) {
			atNow = toMap((data.networth?.accounts ?? []).map((a) => ({ ...a })));
			adjNow = toMap(data.networth?.adjustments ?? []);
			adjPrev = new Map();
			prevVals = new Map();
			locators = new Map();
			return;
		}
		loading = true;
		const [now, before] = await Promise.all([networthAt(shownDate), networthAt(prevDate)]);
		if (now) {
			atNow = toMap(now.accounts);
			adjNow = toMap(now.adjustments);
			locators = new Map(Object.entries(now.logged ?? {}));
		}
		if (before) {
			prevVals = toMap(before.accounts);
			adjPrev = toMap(before.adjustments);
		}
		loading = false;
	}
	$effect(() => {
		shownDate;
		edit;
		void refresh();
	});

	/** What the ledger computes for this month before anything new is logged. */
	function expected(account: string): number | null {
		const value = atNow.get(account);
		if (value == null) return null;
		// An assertion already standing on this date has had its own adjustment applied; back that
		// out so Expected always means "before this month's snapshot".
		const thisMonthAdj = (adjNow.get(account) ?? 0) - (adjPrev.get(account) ?? 0);
		return locators.has(account) ? value - thisMonthAdj : value;
	}
	const previous = (account: string) => prevVals.get(account) ?? null;

	// Typed values, keyed by month so switching months never carries an entry across. Liabilities
	// are typed as the amount owed (positive) and stored negative — the sign the ledger keeps.
	let typed = $state<Record<string, string>>({});
	const cellKey = (account: string) => `${monthKey}|${account}`;
	const raw = (account: string) => typed[cellKey(account)] ?? '';

	function parsed(row: Row): number | null {
		const text = raw(row.account).replace(/[,$\s]/g, '');
		if (text === '') return null;
		const n = Number(text);
		if (!Number.isFinite(n)) return null;
		return row.liability ? -Math.abs(n) : n;
	}

	/** Balance − Expected: the adjustment this month's snapshot would post, on its own. */
	function check(row: Row): number | null {
		const value = parsed(row);
		const exp = expected(row.account);
		return value == null || exp == null ? null : value - exp;
	}
	const matches = (row: Row) => {
		const c = check(row);
		return c != null && Math.abs(c) < 0.005;
	};
	/** A liability whose figure disagrees with the ledger — unlogged spending, not an adjustment. */
	const isBlocked = (row: Row) => row.liability && parsed(row) != null && !matches(row);

	const filled = $derived(rows.filter((r) => parsed(r) != null));
	const blocked = $derived(rows.filter(isBlocked));
	const savable = $derived(filled.filter((r) => !isBlocked(r)));

	/** Effective figure for the aggregation: what was typed, else what the ledger already has. */
	const effective = (row: Row) =>
		parsed(row) ?? expected(row.account) ?? previous(row.account) ?? 0;
	const assets = $derived(rows.filter((r) => !r.liability).reduce((s, r) => s + effective(r), 0));
	// Liabilities are stored negative; the tally shows what is owed.
	const liabilities = $derived(
		rows.filter((r) => r.liability).reduce((s, r) => s + Math.abs(effective(r)), 0)
	);

	const subtotal = (group: Group) =>
		rows.filter((r) => r.group === group).reduce((s, r) => s + effective(r), 0);

	let busy = $state(false);
	let err = $state('');
	let note = $state('');

	async function saveAll() {
		if (!savable.length) return;
		busy = true;
		err = '';
		note = '';
		const failures: string[] = [];
		for (const row of savable) {
			const value = parsed(row);
			if (value == null) continue;
			// Liabilities go over the wire as the owed figure; the API stores the sign.
			const amount = row.liability ? Math.abs(value) : value;
			const existing = locators.get(row.account);
			const { error } = existing
				? await updateBalance(existing, amount)
				: await logBalance(row.account, amount, shownDate);
			if (error) failures.push(`${formatAccount(row.account)}: ${error}`);
			else delete typed[cellKey(row.account)];
		}
		busy = false;
		if (failures.length) err = failures.join(' · ');
		else note = `Saved ${savable.length}.`;
		onsaved();
		await refresh();
	}
</script>

<Pane title="Log balances">
	{#snippet actions()}
		{#if edit && rows.length}
			<span class="progress">{filled.length}/{rows.length}</span>
		{/if}
	{/snippet}

	{#if !edit}
		<p class="cap">Start the local API (<code>make serve-api</code>) to log balances.</p>
	{:else if !rows.length}
		<p class="cap">No loggable accounts yet. Open one under Manage.</p>
	{:else}
		<!-- The tally leads: it is what the whole pass is for, and it updates as each figure lands. -->
		<dl class="agg">
			<div>
				<dt>Assets</dt>
				<dd>{money(assets)}</dd>
			</div>
			<div>
				<dt>Liabilities</dt>
				<dd>−{money(liabilities)}</dd>
			</div>
			<div>
				<dt>Net worth</dt>
				<dd>{money(assets - liabilities)}</dd>
			</div>
		</dl>

		<!-- A table, not a grid of rows: the browser sizes each column to its widest cell and shares
		     that width across every row, so the figures line up and hug the right edge at any pane
		     width. The name cell takes all the slack. -->
		<table class="bal" class:loading>
			<thead>
				<tr>
					<th scope="col">Account</th>
					<th scope="col" class="num">Previous</th>
					<th scope="col" class="num">Expected</th>
					<th scope="col" class="num">Balance</th>
					<th scope="col" class="num">Change</th>
					<th scope="col" class="num">Check</th>
				</tr>
			</thead>
			<tbody>
				{#each GROUP_ORDER as group (group)}
					{@const members = rows.filter((r) => r.group === group)}
					{#if members.length}
						<tr class="glabel">
							<th scope="rowgroup">{group}</th>
							<td class="num" colspan="5">{money(subtotal(group))}</td>
						</tr>
						{#each members as row (row.account)}
							{@const value = parsed(row)}
							{@const prev = previous(row.account)}
							{@const exp = expected(row.account)}
							{@const chk = check(row)}
							<tr class:done={value != null && !isBlocked(row)} class:bad={isBlocked(row)}>
								<td class="nm">
									<i class="dot" style:background={accountVar(row.account)}></i>
									<span class="label">{formatAccount(row.account)}</span>
								</td>
								<td class="num muted">{prev == null ? '—' : moneyExact(prev)}</td>
								<td class="num muted">{exp == null ? '—' : moneyExact(exp)}</td>
								<td>
									<label class="entry">
										<span class="vh">Balance for {formatAccount(row.account)}</span>
										<span class="cur">$</span>
										<input
											inputmode="decimal"
											placeholder="—"
											disabled={busy}
											bind:value={typed[cellKey(row.account)]}
										/>
									</label>
								</td>
								<td class="num" class:pos={value != null && prev != null && value - prev >= 0}
									>{value == null || prev == null ? '—' : moneyExact(value - prev)}</td
								>
								<td class="num">
									{#if chk == null}
										—
									{:else if matches(row)}
										<span class="tag ok" title="Matches the ledger">✓</span>
									{:else if row.liability}
										<span class="tag err" title="Off by {moneyExact(chk)} — an entry is missing"
											>✕</span
										>
									{:else}
										<span class="tag adj" title="Adjustment this month would post"
											>{moneyExact(chk)}</span
										>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				{/each}
			</tbody>
		</table>

		<div class="foot">
			{#if blocked.length}
				<p class="blockmsg" role="status">
					{#each blocked as row (row.account)}
						{@const gap = check(row)}
						<span class="bl">
							<b>{formatAccount(row.account)}</b> is off by {moneyExact(Math.abs(gap ?? 0))} — log the
							missing {(gap ?? 0) < 0 ? 'spending' : 'bill pay'} first.
						</span>
					{/each}
				</p>
			{/if}

			{#if err}<p class="err" role="alert">{err}</p>{/if}
			{#if note}<p class="note" role="status">{note}</p>{/if}

			<div class="actions">
				<button class="btn-primary" onclick={saveAll} disabled={busy || !savable.length}>
					{busy ? 'Saving…' : savable.length ? `Save ${savable.length}` : 'Save'}
				</button>
			</div>
		</div>
	{/if}
</Pane>

<style>
	/* Bled to the card's edges so the row hover runs edge-to-edge; the first and last cells restore
	   the content inset. Column widths come from the content, so nothing is pinned to a fixed size. */
	.bal {
		width: calc(100% + 2 * var(--pad-card-x));
		margin-inline: calc(-1 * var(--pad-card-x));
		border-collapse: collapse;
	}
	.bal.loading {
		opacity: 0.55;
	}
	.bal th,
	.bal td {
		padding: var(--space-3) var(--space-5);
		white-space: nowrap;
		vertical-align: middle;
	}
	/* The name column absorbs every spare pixel, which pushes the figure columns — each only as wide
	   as its own widest value — hard against the right edge at any pane width. */
	.bal th:first-child,
	.bal td:first-child {
		width: 100%;
		padding-left: var(--pad-card-x);
	}
	.bal th:last-child,
	.bal td:last-child {
		padding-right: var(--pad-card-x);
	}
	.bal thead th {
		padding-top: 0;
		font-size: var(--text-column);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		color: var(--ink-3);
		font-weight: var(--fw-semibold);
		text-align: left;
	}
	.bal tbody tr:not(.glabel):hover td {
		background: color-mix(in srgb, var(--lav) 7%, transparent);
	}
	.glabel th,
	.glabel td {
		padding-top: var(--space-5);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wider);
		color: var(--ink-3);
		font-weight: var(--fw-semibold);
		text-align: left;
	}
	.glabel td {
		color: var(--ink-2);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-size: var(--text-meta);
	}
	.muted {
		color: var(--ink-3);
	}
	.pos {
		color: var(--good-text);
	}
	.nm {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		min-width: 0;
		font-size: var(--text-control);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
		flex: none;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Entry cell: the only interactive column, so it is the only one with a border. */
	.entry {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-5);
	}
	.entry:focus-within {
		border-color: var(--lav);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lav) 22%, transparent);
	}
	.done .entry {
		border-color: color-mix(in srgb, var(--good) 45%, var(--border));
	}
	.bad .entry {
		border-color: color-mix(in srgb, var(--crit) 55%, var(--border));
	}
	.cur {
		color: var(--ink-3);
		font-size: var(--text-meta);
	}
	.entry input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: var(--text-control);
		text-align: right;
		font-variant-numeric: tabular-nums;
		padding: 0;
	}
	.entry input:focus {
		outline: none;
	}
	/* visually hidden label text — the input keeps an accessible name without visible chrome */
	.vh {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.tag {
		border-radius: var(--radius-pill);
		padding: 0 var(--space-3);
		font-size: var(--text-badge);
		font-weight: var(--fw-bold);
		border: 1px solid transparent;
		white-space: nowrap;
	}
	.tag.ok {
		background: color-mix(in srgb, var(--good) 15%, transparent);
		color: var(--good-text);
		border-color: color-mix(in srgb, var(--good) 40%, transparent);
	}
	.tag.adj {
		background: color-mix(in srgb, var(--gold) 18%, transparent);
		color: var(--gold-text);
		border-color: color-mix(in srgb, var(--gold) 42%, transparent);
	}
	.tag.err {
		background: color-mix(in srgb, var(--crit) 15%, transparent);
		color: var(--crit-text);
		border-color: color-mix(in srgb, var(--crit) 45%, transparent);
	}
	.foot {
		border-top: 1px solid var(--border);
		margin-top: var(--space-6);
		padding-top: var(--gap-field);
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
	}
	.agg {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		margin: var(--space-6) 0 var(--gap-field);
	}
	.agg > div {
		background: var(--surface-2);
		padding: var(--space-5) var(--space-7);
	}
	.agg dt {
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		color: var(--ink-3);
		font-weight: var(--fw-semibold);
	}
	.agg dd {
		margin: var(--space-1) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-amount);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
	}
	.progress {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.blockmsg {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-secondary);
		color: var(--ink-2);
	}
	.bl b {
		color: var(--ink);
	}
	.cap,
	.note {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		margin: 0;
	}
	.err {
		color: var(--crit-text);
		font-size: var(--text-secondary);
		margin: 0;
	}
	/* Narrow viewports: let the table scroll sideways rather than crushing the figure columns. */
	@media (max-width: 52rem) {
		.bal {
			display: block;
			overflow-x: auto;
			white-space: nowrap;
		}
	}
</style>
