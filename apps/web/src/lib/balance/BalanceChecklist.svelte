<script lang="ts">
	// Every loggable account on one screen, so a month's snapshot is one pass down the Balance column.
	// A row that can't be saved blocks (see `blockReason`); "Save" commits the rest and says what it
	// skipped.
	import type { DashboardData } from '$lib/data/types';
	import { type AccountsInfo, live, logBalance, networthAt, updateBalance } from '$lib/data/load';
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
	import Pane from '$lib/layout/grid/Pane.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import { sumBy } from '$lib/utils/num';

	interface Props {
		id: string;
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
		/** Selected month, "YYYY-MM". */
		monthKey: string;
	}
	let { id, data, accounts, onsaved, monthKey }: Props = $props();

	const rows = $derived(
		buildRows(accounts?.balance_accounts ?? [], accounts?.liability_accounts ?? [], formatAccount)
	);

	/** Empty until the parent has resolved a month, so the fetch below can skip that first render. */
	const firstDayOf = (key: string) => (key ? `${key}-01` : '');
	const shownDate = $derived(firstDayOf(monthKey));
	const prevDate = $derived(monthKey ? firstDayOf(addMonths(monthKey, -1)) : '');

	// Two dated reads: this month's snapshot and the previous one. The difference between their
	// adjustment totals is what isolates this month's figure.
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
		// Without the API nothing can serve the dated reads, so the two-date columns read as unavailable
		// rather than as wrong.
		if (!$live) {
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
		$live;
		void refresh();
	});

	const expected = (account: string) =>
		expectedAt(account, atNow, adjNow, adjPrev, locators.has(account));
	const previous = (account: string) => prevVals.get(account) ?? null;

	// Keyed by month so switching months never carries an entry across. Liabilities are typed as the
	// amount owed and stored negative.
	let typed = $state<Record<string, number | null>>({});
	const cellKey = (account: string) => `${monthKey}|${account}`;

	function parsed(row: Row): number | null {
		const n = typed[cellKey(row.account)];
		if (n == null || !Number.isFinite(n)) return null;
		return signedForLedger(row, n);
	}

	const check = (row: Row) => checkOf(parsed(row), expected(row.account));
	const matches = (row: Row) => agrees(check(row));
	const whyBlocked = (row: Row) => blockReason(row, parsed(row), expected(row.account));
	const blockedRow = (row: Row) => isBlocked(row, parsed(row), expected(row.account));

	/**
	 * Why a row can't be saved, phrased to FOLLOW the account name: the footer note puts the name in
	 * bold ahead of it, the row's own badge repeats the name inline. One source for the wording, so the
	 * two can't drift apart.
	 */
	function blockedPredicate(row: Row): string {
		const gap = check(row) ?? 0;

		return whyBlocked(row) === 'negative'
			? "can't hold a negative balance — enter what it is worth, not what it moved."
			: `is off by ${moneyExact(Math.abs(gap))} — log the missing ${missingEntryKind(gap)} first.`;
	}

	const filled = $derived(rows.filter((r) => parsed(r) != null));
	const blocked = $derived(rows.filter(blockedRow));
	const savable = $derived(filled.filter((r) => !blockedRow(r)));

	const effective = (row: Row) =>
		parsed(row) ?? expected(row.account) ?? previous(row.account) ?? 0;
	const assets = $derived(
		sumBy(
			rows.filter((r) => !r.liability),
			effective
		)
	);
	// Liabilities are stored negative; the tally shows what is owed.
	const liabilities = $derived(
		sumBy(
			rows.filter((r) => r.liability),
			(r) => Math.abs(effective(r))
		)
	);

	const subtotal = (group: Group) =>
		sumBy(
			rows.filter((r) => r.group === group),
			effective
		);

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

<Pane {id} title="Log balances" caption="A month's snapshot is its first-of-month assertion">
	{#snippet actions()}
		{#if rows.length}
			<span class="progress">{filled.length}/{rows.length}</span>
		{/if}
	{/snippet}

	{#if !rows.length}
		<p class="cap">No loggable accounts yet. Open one under Manage.</p>
	{:else}
		<dl class="agg bleed-x">
			<div>
				<dt>Assets</dt>
				<dd>{money(assets)}</dd>
			</div>
			<div>
				<dt>Liabilities</dt>
				<dd>−{money(liabilities)}</dd>
			</div>
			<div class="sum">
				<dt>Net worth</dt>
				<dd>{money(assets - liabilities)}</dd>
			</div>
		</dl>

		<!-- A table, so shared column widths line the figures up at any pane width. -->
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
										<span class="who">
											<i class="dot" style:background={accountVar(row.account)}></i>
											<span class="label">{formatAccount(row.account)}</span>
										</span>
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
										{:else if blockedRow(row)}
											<Badge
												tone="crit"
												filled
												title={`${formatAccount(row.account)} ${blockedPredicate(row)}`}>✕</Badge
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
			<!-- Also on each row's badge, but a `title` is hover-only: this is the copy a keyboard or touch
			     user gets, and the live region that announces a row going from savable to blocked. -->
			{#if blocked.length}
				<p class="blockmsg" role="status">
					{#each blocked as row (row.account)}
						<span class="bl">
							<b>{formatAccount(row.account)}</b>
							{blockedPredicate(row)}
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
	/* Bug: bleed plus sideways scroll on the table itself scrolled the whole page when narrow, so the
	   bleed lives on the wrapper that scrolls. */
	.balbox {
		width: calc(100% + 2 * var(--pad-card-x));
		margin-inline: calc(-1 * var(--pad-card-x));
	}
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
	/* `width: 100%` makes the name column absorb the spare space, pushing the figure columns right. */
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
	/* Bug: `display: flex` on the CELL takes it out of the table's row-height alignment, so its
	   background hugged the name while the taller entry cell beside it filled the row and the hover
	   highlight stepped mid-row. The cell stays a table-cell; the wrapper does the laying out. */
	.nm {
		font-size: var(--text-control);
	}
	/* `min-width: 0` is what lets the label ellipsis: it drops the wrapper's min-content width to
	   zero, which is the cell's contribution to the column and so the only thing the table would
	   otherwise refuse to shrink past. */
	.who {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		min-width: 0;
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
	/* The sheet's own header, not a box above it: the figures sit on one bled row that ends on the
	   same hairline the group rows use, so the tally joins the table's rhythm instead of starting a
	   second one. Boxed cells read as a spreadsheet header, which is the one thing this pane must not
	   look like. Flex, not a track grid — a `1fr` track can't go below its content's min-width, so the
	   figures overflowed the card when narrow, and wrapping reflows them instead.
	   `margin-block`, not the `margin` shorthand: the inline halves belong to `.bleed-x`, and the
	   shorthand outranks it from inside a component and would undo the bleed. */
	.agg {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-field) var(--space-11);
		margin-block: 0 var(--space-8);
		padding: var(--space-4) var(--pad-card-x) var(--gap-row);
		border-bottom: 1px solid var(--border);
	}
	/* Label beside figure rather than above it — stacked, the row costs two lines and stops being a
	   header. */
	.agg > div {
		display: flex;
		align-items: baseline;
		gap: var(--gap-row);
	}
	.agg dt {
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		color: var(--ink-3);
		font-weight: var(--fw-semibold);
	}
	.agg dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-amount);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--ls-tighter);
		/* `normal`, not a ratio: a tighter line box leaves the glyphs overflowing it, which the pane's
		   resize probe reads as content that no longer fits. */
		line-height: normal;
		color: var(--ink-2);
	}
	/* The figure the other two exist to produce: pushed to the far edge and the only one at full
	   weight. `margin-inline-start: auto` rather than `space-between`, which floated Liabilities out
	   into the empty middle of the account column. */
	.agg .sum {
		margin-inline-start: auto;
	}
	.agg .sum dd {
		font-size: var(--text-figure);
		color: var(--ink);
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
</style>
