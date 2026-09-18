<script lang="ts">
	// Every loggable account on one screen, so a month's snapshot is one pass down the Balance column.
	// A row that can't be saved blocks (see `blockReason`); "Save" commits the rest and says what it
	// skipped.
	import type { DashboardData } from '$lib/data/types';
	import { NO_VALUE } from '$lib/copy';
	import {
		type AccountsInfo,
		type NetWorthAt,
		live,
		logBalance,
		networthAt,
		updateBalance
	} from '$lib/data/load';
	import { amountExact, formatAccount, money, moneyExact, monthLabel } from '$lib/utils/format';
	import { accountVar } from '$lib/utils/theme';
	import { addMonths } from '$lib/utils/period';
	import {
		agrees,
		asTyped,
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
	import { words } from '$lib/ui/label';

	interface Props {
		id: string;
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
		/** Selected month, "YYYY-MM". */
		monthKey: string;
	}
	let { id, data, accounts, onsaved, monthKey }: Props = $props();

	/**
	 * Which accounts the shown month had, once the dated read lands. The props are today's lists, so
	 * they stand in only until then: on their own they offer a card opened months later.
	 */
	let monthRoster = $state<{ assets: string[]; liabilities: string[] } | null>(null);
	const rows = $derived(
		buildRows(
			monthRoster?.assets ?? accounts?.balance_accounts ?? [],
			monthRoster?.liabilities ?? accounts?.liability_accounts ?? [],
			formatAccount
		)
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
	/** What this month already holds per account: the figure to ghost, and where a correction goes. */
	let logged = $state<Map<string, NetWorthAt['logged'][string]>>(new Map());
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
			logged = new Map();
			monthRoster = null;
			return;
		}
		loading = true;
		const [now, before] = await Promise.all([networthAt(shownDate), networthAt(prevDate)]);
		if (now) {
			atNow = toMap(now.accounts);
			adjNow = toMap(now.adjustments);
			logged = new Map(Object.entries(now.logged ?? {}));
			monthRoster = { assets: now.balance_accounts, liabilities: now.liability_accounts };
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
		expectedAt(account, atNow, adjNow, adjPrev, logged.has(account));
	const previous = (account: string) => prevVals.get(account) ?? null;
	/** What this month's latest snapshot puts the account at, in the ledger's sign. Zero is a figure,
	    so this is null only when the month holds nothing for the account. */
	const onRecord = (account: string) => logged.get(account)?.amount ?? null;

	// Keyed by month so switching months never carries an entry across. Liabilities are typed as the
	// amount owed and stored negative.
	let typed = $state<Record<string, number | null>>({});
	const cellKey = (account: string) => `${monthKey}|${account}`;

	function parsed(row: Row): number | null {
		const n = typed[cellKey(row.account)];
		if (n == null || !Number.isFinite(n)) return null;
		return signedForLedger(row, n);
	}

	/**
	 * The figure a row stands at: what was typed, else what the month already asserts. This is what
	 * makes a logged month read as done — the field is empty, but the balance is not unknown.
	 */
	const standing = (row: Row) => parsed(row) ?? onRecord(row.account);

	// The figure COLUMNS stay in the ledger's sign, where a liability is negative because that is how
	// it bears on net worth. Only the entry field and its ghost invert (see `asTyped`), so logging an
	// ordinary balance owed does not mean typing a minus every time. The two conventions differ on
	// purpose; a row is read across, but only one cell of it is typed into.

	/**
	 * Where a typed figure goes: over this month's own snapshot, or onto the first when the month
	 * holds none. Null when the month's snapshot is share-based — that is refused rather than
	 * rewritten. A share-based month blocks only itself; the next month has its own snapshot to log.
	 */
	function target(row: Row): { locator: string } | { date: string } | null {
		const rec = logged.get(row.account);
		if (!rec) return { date: shownDate };

		return rec.locator ? { locator: rec.locator } : null;
	}

	// Blocking and the gap are about a figure being ENTERED: an assertion already in the ledger loads,
	// so it cannot be blocked, and its gap was settled when it was written.
	const check = (row: Row) => checkOf(parsed(row), expected(row.account));
	const matches = (row: Row) => agrees(check(row));
	const whyBlocked = (row: Row) =>
		blockReason(row, parsed(row), expected(row.account), target(row) != null);
	const blockedRow = (row: Row) =>
		isBlocked(row, parsed(row), expected(row.account), target(row) != null);

	/**
	 * Why a row can't be saved, phrased to FOLLOW the account name: the footer note puts the name in
	 * bold ahead of it, the row's own badge repeats the name inline. One source for the wording, so the
	 * two can't drift apart.
	 */
	function blockedPredicate(row: Row): string {
		const why = whyBlocked(row);
		if (why === 'share-snapshot') {
			return `was snapshotted in shares in ${monthLabel(monthKey)}. Only backfilling shares is allowed.`;
		}
		if (why === 'negative') {
			return "can't hold a negative balance, please enter a positive figure.";
		}
		const gap = check(row) ?? 0;

		return `is off by ${moneyExact(Math.abs(gap))}, please log the missing ${missingEntryKind(gap)} first.`;
	}

	// `entered` is what Save writes; `settled` is what the month has a figure for either way, and so
	// what the progress count is about.
	const entered = $derived(rows.filter((r) => parsed(r) != null));
	const settled = $derived(rows.filter((r) => standing(r) != null));
	const blocked = $derived(rows.filter(blockedRow));
	const savable = $derived(entered.filter((r) => !blockedRow(r)));

	const effective = (row: Row) =>
		standing(row) ?? expected(row.account) ?? previous(row.account) ?? 0;
	const assets = $derived(
		sumBy(
			rows.filter((r) => !r.liability),
			effective
		)
	);
	// Inverted because the tally prints its own minus, so this is the magnitude owed. Inverted rather
	// than made absolute, so a credit subtracts from the total instead of adding to it.
	const liabilities = $derived(
		sumBy(
			rows.filter((r) => r.liability),
			(r) => asTyped(r, effective(r))
		)
	);

	// In the ledger's sign, like the column it sits in: the Liabilities group subtotals negative.
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
			// Sent in the convention it was typed in; the API applies the ledger's sign.
			const amount = asTyped(row, value);
			const where = target(row);
			if (where == null) continue; // blocked, so never in `savable`
			const { error } =
				'locator' in where
					? await updateBalance(where.locator, amount)
					: await logBalance(row.account, amount, where.date);
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

<Pane
	{id}
	title={words('Log balances')}
	caption={words("monthly snapshot of each account's balance")}
>
	{#snippet actions()}
		{#if rows.length}
			<span class="progress">{settled.length}/{rows.length}</span>
		{/if}
	{/snippet}

	{#if !rows.length}
		<p class="cap">No tracked accounts yet. Open one under Manage.</p>
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
							<!-- The subtotal takes the Previous column ALONE, not a colspan: spanning the figure
							     columns left it aligned to the edge of the span rather than to a column of digits. -->
							<tr class="glabel">
								<th scope="rowgroup">{group}</th>
								<td class="num">{money(subtotal(group))}</td>
								<td colspan="4"></td>
							</tr>
							{#each members as row (row.account)}
								{@const value = standing(row)}
								{@const rec = onRecord(row.account)}
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
									<td class="num muted">{prev == null ? NO_VALUE : moneyExact(prev)}</td>
									<td class="num muted">{exp == null ? NO_VALUE : moneyExact(exp)}</td>
									<td class="entrycell">
										<!-- A logged month ghosts its own figure, so stepping back to one shows what it
										     holds without prefilling a field that would then look edited. -->
										<AmountInput
											prefix="$"
											placeholder={rec == null ? NO_VALUE : amountExact(asTyped(row, rec))}
											signed
											disabled={busy}
											ariaLabel={`Balance for ${formatAccount(row.account)}`}
											bind:value={typed[cellKey(row.account)]}
										/>
									</td>
									<td class="num" class:pos={value != null && prev != null && value - prev >= 0}
										>{value == null || prev == null ? NO_VALUE : moneyExact(value - prev)}</td
									>
									<td class="num">
										{#if chk == null && rec != null}
											<Badge tone="good" filled title="Logged for this month">✓</Badge>
										{:else if chk == null}
											{NO_VALUE}
										{:else if blockedRow(row)}
											<!-- Ahead of `matches`: a figure the month cannot take is blocked even when it
											     agrees, and a green tick on a row that will not save reads as saved. -->
											<Badge
												tone="crit"
												filled
												title={`${formatAccount(row.account)} ${blockedPredicate(row)}`}>✕</Badge
											>
										{:else if matches(row)}
											<Badge tone="good" filled title="Matches the ledger">✓</Badge>
										{:else}
											<Badge
												tone="warn"
												filled
												title="Untracked transfers this month will post as an adjustment"
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
					{busy ? 'Saving...' : 'Save'}
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
	}
	/* A column title sits over its own figures, so only the text columns are left-aligned and `.num`
	   governs the rest. Stated as `:not(.num)` because a bare `th` rule outranks `.num` and silently
	   left-aligned every numeric header. */
	.bal thead th:not(.num) {
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
	}
	/* Only the group's NAME is left-aligned; its subtotal is a figure and takes `.num`, which a rule
	   naming both cells would have outranked. */
	.glabel th {
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
</style>
