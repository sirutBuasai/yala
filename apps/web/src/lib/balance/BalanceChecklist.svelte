<script lang="ts">
	// "Log balances" — every loggable account on one screen, so a month's snapshot is one pass down the
	// Balance column. A month's snapshot is its FIRST-of-month assertion, the convention the whole
	// ledger follows.
	//
	// The columns make a figure checkable before it is committed:
	//   Previous — what stood at the previous month's snapshot
	//   Expected — what the ledger computes for this one, before anything new is logged
	//   Change   — Balance − Previous, how much the account moved this month
	//   Check    — Balance − Expected, only the adjustment this month would post
	//
	// A row that can't be saved blocks (see `blockReason`); "Save" commits the rest and says what it
	// skipped.
	import type { DashboardData } from '$lib/data/types';
	import { type AccountsInfo, logBalance, networthAt, updateBalance } from '$lib/data/load';
	import { formatAccount, money, moneyExact } from '$lib/utils/format';
	import { accountVar } from '$lib/utils/theme';
	import { addMonths } from '$lib/utils/period';
	import {
		agrees,
		blockReason,
		buildRows,
		checkOf,
		expectedAt,
		GROUP_ORDER,
		isBlocked,
		missingEntryKind,
		signedForLedger,
		type Group,
		type Row
	} from '$lib/balance/checklist';
	import Pane from '$lib/ui/Pane.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';
	import Badge from '$lib/ui/Badge.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
		/** Selected month "YYYY-MM" — shared with the calendar via the header stepper. */
		monthKey: string;
	}
	let { data, accounts, edit, onsaved, monthKey }: Props = $props();

	const rows = $derived(
		buildRows(accounts?.balance_accounts ?? [], accounts?.liability_accounts ?? [], formatAccount)
	);

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

	/** What the ledger computes for this month before anything new is logged (see checklist.ts). */
	const expected = (account: string) =>
		expectedAt(account, atNow, adjNow, adjPrev, locators.has(account));
	const previous = (account: string) => prevVals.get(account) ?? null;

	// Typed values, keyed by month so switching months never carries an entry across. Liabilities are
	// typed as the amount owed (positive) and stored negative, the sign the ledger keeps.
	let typed = $state<Record<string, number | null>>({});
	const cellKey = (account: string) => `${monthKey}|${account}`;

	function parsed(row: Row): number | null {
		const n = typed[cellKey(row.account)];
		if (n == null || !Number.isFinite(n)) return null;
		return signedForLedger(row, n);
	}

	/** Balance − Expected: the adjustment this month's snapshot would post, on its own. */
	const check = (row: Row) => checkOf(parsed(row), expected(row.account));
	const matches = (row: Row) => agrees(check(row));
	/** Why a row can't be saved: an impossible figure, or a liability that disagrees with the ledger
	    (unlogged spending, not an adjustment). */
	const whyBlocked = (row: Row) => blockReason(row, parsed(row), expected(row.account));
	const blockedRow = (row: Row) => isBlocked(row, parsed(row), expected(row.account));

	const filled = $derived(rows.filter((r) => parsed(r) != null));
	const blocked = $derived(rows.filter(blockedRow));
	const savable = $derived(filled.filter((r) => !blockedRow(r)));

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

<div class="balancepane">
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

			<!-- A table, not a grid of rows: shared column widths line the figures up at any pane width,
			     and the wrapper scrolls sideways when six money columns no longer fit. -->
			<div class="balbox scroller-x">
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
									<tr class:done={value != null && !blockedRow(row)} class:bad={blockedRow(row)}>
										<td class="nm">
											<i class="dot" style:background={accountVar(row.account)}></i>
											<span class="label">{formatAccount(row.account)}</span>
										</td>
										<td class="num muted">{prev == null ? '—' : moneyExact(prev)}</td>
										<td class="num muted">{exp == null ? '—' : moneyExact(exp)}</td>
										<td class="entrycell">
											<AmountInput
												prefix="$"
												placeholder="—"
												signed
												disabled={busy}
												ariaLabel={`Balance for ${formatAccount(row.account)}`}
												bind:value={typed[cellKey(row.account)]}
											/>
										</td>
										<td class="num" class:pos={value != null && prev != null && value - prev >= 0}
											>{value == null || prev == null ? '—' : moneyExact(value - prev)}</td
										>
										<td class="num">
											{#if chk == null}
												—
											{:else if matches(row)}
												<Badge tone="good" filled title="Matches the ledger">✓</Badge>
											{:else if row.liability}
												<Badge
													tone="crit"
													filled
													title="Off by {moneyExact(chk)} — an entry is missing">✕</Badge
												>
											{:else}
												<Badge tone="warn" filled title="Adjustment this month would post"
													>{moneyExact(chk)}</Badge
												>
											{/if}
										</td>
									</tr>
								{/each}
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			<div class="foot">
				{#if blocked.length}
					<p class="blockmsg" role="status">
						{#each blocked as row (row.account)}
							{@const gap = check(row) ?? 0}
							<span class="bl">
								<b>{formatAccount(row.account)}</b>
								{#if whyBlocked(row) === 'negative'}
									can't hold a negative balance — enter what it is worth, not what it moved.
								{:else}
									is off by {moneyExact(Math.abs(gap))} — log the missing {missingEntryKind(gap)}
									first.
								{/if}
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
</div>

<style>
	/* Capped rather than full-width: stretched to a fullscreen desktop, a name and its own figures end
	   up so far apart that the row stops reading as one. */
	.balancepane {
		max-width: 52rem;
	}

	/* The bleed lives on the wrapper because it is also the sideways scroller; with both on the table,
	   a narrow viewport scrolled the whole page instead. */
	.balbox {
		width: calc(100% + 2 * var(--pad-card-x));
		margin-inline: calc(-1 * var(--pad-card-x));
	}
	/* Column widths come from the content, so nothing is pinned to a fixed size. */
	.bal {
		width: 100%;
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
	/* The entry cell's chrome comes from AmountInput; all that is left here is the row-state tint. */
	.done .entrycell :global(.amountinput) {
		border-color: color-mix(in srgb, var(--good) 45%, var(--border));
	}
	.bad .entrycell :global(.amountinput) {
		border-color: color-mix(in srgb, var(--crit) 55%, var(--border));
	}
	.foot {
		border-top: 1px solid var(--border);
		margin-top: var(--space-6);
		padding-top: var(--gap-field);
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
	}
	/* `1fr` alone can't go below its content's min-width, so three columns of six-figure sums overflowed
	   the card on a phone; auto-fit reflows them into rows. */
	.agg {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
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
	/* No breakpoint for the narrow case: `.balbox` scrolls whenever the columns need more width than
	   the pane has. */
</style>
