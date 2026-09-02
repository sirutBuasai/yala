<script lang="ts">
	// "Log balances" pane — used on Home (and later Net Worth). It is BOTH a logger and a viewer:
	// the account list scrolls freely with the selected account emphasized by weight + size (no
	// fixed selection box), and it reflects the SELECTED month. Changing the month (via the shared
	// header stepper) shows that month's recorded balance + adjustment for each account and
	// pre-fills the input with it; saving edits that account's balance for that month.
	//
	// A month's snapshot is its FIRST-of-month assertion — the convention the whole ledger follows
	// (and the spreadsheet it was migrated from), where "July 2024" is the balance standing on
	// 2024-07-01. Log a balance more than once in a month and the extra dates appear as chips.
	import type { DashboardData } from '$lib/data/types';
	import { type AccountsInfo, logBalance, networthAt, updateBalance } from '$lib/data/load';
	import { formatAccount, money, monthLabel } from '$lib/utils/format';
	import Wheel from '$lib/ui/Wheel.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
		onsaved: () => void;
		/** Selected month "YYYY-MM" — shared with the calendar via the header stepper. */
		monthKey: string;
	}
	let { data, accounts, edit, onsaved, monthKey }: Props = $props();

	const balAccounts = $derived(
		accounts?.balance_accounts ?? (data.networth?.accounts ?? []).map((a) => a.account)
	);

	// Per-account values + adjustments AS OF the shown snapshot date (fetched live), plus the
	// per-account locator of the assertion standing on it. Falls back to the current snapshot from
	// data.json in view mode.
	let asOfVals = $state<Map<string, number>>(new Map());
	let asOfAdj = $state<Map<string, number>>(new Map());
	let logged = $state<Map<string, string>>(new Map());
	let loading = $state(false);

	/** First day of "YYYY-MM" as an ISO date — where a month's snapshot is asserted. */
	function firstDayOf(key: string): string {
		const [y, m] = key.split('-').map(Number);
		return y && m ? `${y}-${String(m).padStart(2, '0')}-01` : '';
	}

	// Dates already logged inside the shown month, from the contract's snapshot series. Usually just
	// the 1st; a month logged more than once lists each date so any of them can be viewed or edited.
	const monthDates = $derived(
		(data.networth?.series ?? []).map((p) => p.date).filter((d) => d.startsWith(`${monthKey}-`))
	);

	// Which snapshot the pane is showing. Empty follows the month's default (its 1st); picking a chip
	// pins a specific date until the month changes.
	let pinnedDate = $state('');
	const shownDate = $derived(
		pinnedDate && monthDates.includes(pinnedDate) ? pinnedDate : firstDayOf(monthKey)
	);
	const loggedCount = $derived(balAccounts.filter((a) => logged.has(a)).length);

	async function fetchAsOf() {
		if (!edit || !shownDate) {
			asOfVals = new Map((data.networth?.accounts ?? []).map((a) => [a.account, a.value]));
			asOfAdj = new Map((data.networth?.adjustments ?? []).map((a) => [a.account, a.value]));
			logged = new Map();
			return;
		}
		loading = true;
		const res = await networthAt(shownDate);
		if (res) {
			asOfVals = new Map(res.accounts.map((a) => [a.account, a.value]));
			asOfAdj = new Map(res.adjustments.map((a) => [a.account, a.value]));
			logged = new Map(Object.entries(res.logged ?? {}));
		}
		loading = false;
	}
	// Refetch whenever the shown snapshot or edit-mode changes.
	$effect(() => {
		shownDate;
		edit;
		void fetchAsOf();
	});

	// Drop the pin when the month changes, so each month opens on its own default snapshot.
	$effect(() => {
		monthKey;
		pinnedDate = '';
	});

	let curIdx = $state(0);
	let amountStr = $state('');
	let saved = $state<Set<string>>(new Set()); // accounts saved this session, for the ✓ cue
	let busy = $state(false);
	let err = $state('');
	let wheel: { focus: (i: number) => void } | undefined = $state();

	const current = $derived(balAccounts[curIdx] ?? null);
	const recorded = $derived(current != null ? asOfVals.get(current) : undefined);
	const adj = $derived(current != null ? asOfAdj.get(current) : undefined);
	// The assertion to rewrite when this account already has one on the shown date; without it a
	// save appends a new snapshot instead.
	const locator = $derived(current != null ? logged.get(current) : undefined);

	// Whether this account's balance on the shown date was actually logged, as opposed to carried
	// forward from an earlier snapshot. Every account reports a value on every date, so the value
	// alone says nothing — only an assertion standing on the date does.
	const isRecorded = (acct: string) => logged.has(acct);

	// An account's dot is green when the shown date holds a logged balance for it, or it was just
	// saved — persisting regardless of scroll. Otherwise the focal account is purple and the rest
	// are grey (handled in CSS via .lvl0).
	const filled = (acct: string) => saved.has(acct) || isRecorded(acct);

	// Reset the session ✓ cues when the shown snapshot changes (a fresh date to log/edit).
	$effect(() => {
		shownDate;
		saved = new Set();
	});

	// Pre-fill only from a genuinely logged balance, so hitting save never silently re-records a
	// figure that was merely carried forward. (Doesn't read amountStr, so typing is never clobbered.)
	$effect(() => {
		const c = current;
		const v = c != null && isRecorded(c) ? asOfVals.get(c) : undefined;
		amountStr = v != null ? String(v) : '';
	});

	const entered = $derived(Number(amountStr));
	const hasChange = $derived(
		amountStr.trim() !== '' && !Number.isNaN(entered) && recorded != null && entered !== recorded
	);
	const changeVal = $derived(hasChange ? entered - (recorded as number) : 0);

	async function save() {
		if (!current) return;
		const n = Number(amountStr);
		if (amountStr.trim() === '' || Number.isNaN(n)) {
			err = 'Enter a balance amount.';
			return;
		}
		busy = true;
		err = '';
		// Correct the snapshot standing on this date rather than stacking a second one on it; only a
		// date with nothing logged yet gets a fresh assertion.
		const { error } = locator
			? await updateBalance(locator, n)
			: await logBalance(current, n, shownDate);
		busy = false;
		if (error) {
			err = error;
			return;
		}
		saved = new Set(saved).add(current);
		onsaved();
		await fetchAsOf();
		// Advance to the next account (stops at the end).
		if (curIdx < balAccounts.length - 1) wheel?.focus(curIdx + 1);
	}
</script>

<div class="card">
	{#if !edit}
		<p class="cap">
			Logging balances needs the local edit API. Start it with <code>make serve-api</code> and enable
			edit mode.
		</p>
	{:else if !balAccounts.length}
		<p class="cap">No loggable accounts yet. Open a bank or investment account under Manage.</p>
	{:else}
		<div class="balhead">
			<div>
				<h2 class="serif">Log balances</h2>
				<!-- How much of the shown date is on record; the focal account's own state is in the
				     Recorded/Carried fact below. -->
				<p class="cap">
					Showing <b>{monthLabel(monthKey)}</b>
					· {loggedCount ? `${loggedCount} of ${balAccounts.length} logged` : 'nothing logged yet'}
				</p>
			</div>
			{#if saved.size}<span class="progress">{saved.size} saved</span>{/if}
		</div>

		{#if monthDates.length > 1}
			<!-- more than one snapshot this month: pick which one to view or correct -->
			<div class="snaps" role="group" aria-label="Snapshots this month">
				{#each monthDates as d (d)}
					<button
						type="button"
						class="snap"
						class:on={d === shownDate}
						aria-pressed={d === shownDate}
						onclick={() => (pinnedDate = d)}>{d.slice(8)} {monthLabel(monthKey).slice(0, 3)}</button
					>
				{/each}
			</div>
		{/if}

		<div class="oneby">
			<div class="wheelwrap">
				<Wheel
					bind:this={wheel}
					items={balAccounts}
					bind:selected={curIdx}
					rowHeight={40}
					height={168}
					label={formatAccount}
				>
					{#snippet row(acct, i)}
						{@const d = Math.min(Math.abs(i - curIdx), 2)}
						<span class="wi lvl{d}">
							<span class="dot" class:filled={filled(acct)}></span>
							<span class="nm">{formatAccount(acct)}</span>
						</span>
					{/snippet}
					{#snippet sizer(name)}
						<div class="wi lvl0">
							<span class="dot"></span><span class="nm nowrap">{name}</span>
						</div>
					{/snippet}
				</Wheel>
			</div>

			<div class="focus">
				{#if current}
					<dl class="facts">
						<div>
							<!-- Named for where the figure comes from: an assertion on this date, or the
							     balance carried in from the last one. -->
							<dt>{isRecorded(current) ? 'Recorded' : 'Carried'}</dt>
							<dd class:muted={!isRecorded(current)}>
								{#if loading}…{:else if recorded != null}{money(recorded)}{:else}—{/if}
							</dd>
						</div>
						<div>
							<dt>Adjustment</dt>
							<dd class:muted={!(adj ?? 0)}>
								{#if adj == null || adj === 0}—{:else}{money(adj)}{/if}
							</dd>
						</div>
						<div class="grow">
							<dt>Change</dt>
							<dd class:muted={!hasChange}>
								{#if hasChange}{changeVal >= 0 ? '+' : ''}{money(changeVal)}{:else}—{/if}
							</dd>
						</div>
					</dl>
					<div class="entryrow">
						<label class="bal-field">
							<span class="label">Balance · {shownDate || monthLabel(monthKey)}</span>
							<div class="binput">
								<span class="cur-sym">$</span>
								<input
									inputmode="decimal"
									placeholder="0.00"
									bind:value={amountStr}
									disabled={busy}
									onkeydown={(e) => e.key === 'Enter' && save()}
								/>
							</div>
						</label>
						<button
							class="btn-primary save"
							onclick={save}
							disabled={busy}
							title={locator
								? `Rewrites the ${shownDate} assertion`
								: `Logs a ${shownDate} snapshot`}
						>
							{busy ? 'Saving…' : locator ? 'Update →' : 'Save →'}
						</button>
					</div>
					{#if err}<p class="err" role="alert">{err}</p>{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.balhead {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gap-field);
		margin-bottom: var(--space-8);
		flex-wrap: wrap;
	}
	.balhead h2 {
		font-size: var(--text-panel);
		font-weight: var(--fw-semibold);
		margin: 0 0 var(--space-1);
	}
	.balhead .cap {
		margin: 0;
	}
	.balhead .cap b {
		color: var(--ink-2);
	}
	.progress {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* Only rendered when a month holds more than one snapshot. */
	.snaps {
		display: flex;
		gap: var(--gap-inline);
		flex-wrap: wrap;
		margin-bottom: var(--space-8);
	}
	.snap {
		border: 1px solid var(--border);
		background: var(--inset);
		color: var(--ink-2);
		border-radius: var(--radius-pill);
		padding: var(--space-2) var(--space-6);
		font: inherit;
		font-size: var(--text-caption);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.snap:hover {
		color: var(--ink);
		border-color: var(--lav);
	}
	.snap.on {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		border-color: var(--lav);
		color: var(--ink);
	}

	/* Center the whole entry block so the card's residual width reads as symmetric margin
	   rather than dead space on the right. */
	/* Wheel column fits the widest account name (via the sizer); the entry column takes ALL the
	   remaining width so the card has no dead space on the right. */
	.oneby {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-11);
		align-items: center;
	}

	.wheelwrap {
		position: relative;
	}
	/* the sizer reuses the .wi/.lvl0 row styles; it only needs its label to never wrap */
	.nowrap {
		white-space: nowrap;
	}

	/* Account row inside the Wheel. Selection is conveyed by TYPE only (size / family / weight),
	   graded by distance from the centred row — the barrel look — with no band or gradient. */
	.wi {
		display: flex;
		align-items: center;
		gap: var(--gap-field);
		width: 100%;
		height: 100%;
		padding: 0 var(--space-5);
	}
	/* Dot states: green = balance saved for the month; purple = current selection with no balance
	   yet; grey = no balance and not selected. */
	.wi .dot {
		flex: 0 0 auto;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.wi.lvl0 .dot:not(.filled) {
		background: var(--lav);
		border-color: var(--lav);
	}
	.wi .dot.filled {
		background: var(--green);
		border-color: var(--green);
	}
	.wi .nm {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition:
			font-size 0.12s ease,
			color 0.12s ease;
	}
	/* centred row */
	.wi.lvl0 .nm {
		font-family: var(--font-display);
		font-size: var(--text-dialog);
		font-weight: var(--fw-semibold);
		color: var(--ink);
		letter-spacing: var(--ls-snug);
	}
	/* one row away */
	.wi.lvl1 .nm {
		font-size: var(--text-body);
		color: var(--ink-2);
	}
	/* two or more rows away */
	.wi.lvl2 .nm {
		font-size: var(--text-secondary);
		color: var(--ink-3);
	}

	.focus {
		display: flex;
		flex-direction: column;
		gap: var(--space-7);
	}
	.entryrow {
		display: flex;
		align-items: flex-end;
		gap: var(--gap-field);
	}
	.bal-field {
		flex: 1;
		min-width: 0;
	}
	.save {
		white-space: nowrap;
	}
	/* Facts read as a stat strip across the top of the entry column, boxed so the row carries
	   visual weight instead of floating in space. */
	.facts {
		display: flex;
		gap: var(--space-8);
		margin: 0;
		padding: var(--space-5) var(--space-7);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.facts .grow {
		margin-left: auto;
		text-align: right;
	}
	.facts dt {
		color: var(--ink-3);
		font-size: var(--text-caption);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		margin-bottom: var(--space-1);
	}
	.facts dd {
		margin: 0;
		font-size: var(--text-body);
		font-variant-numeric: tabular-nums;
	}
	.facts dd.muted {
		color: var(--ink-3);
	}
	.label {
		display: block;
		color: var(--ink-3);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		margin-bottom: var(--space-3);
	}
	.binput {
		position: relative;
		width: 100%;
	}
	.binput .cur-sym {
		position: absolute;
		left: var(--space-6);
		top: 50%;
		transform: translateY(-50%);
		color: var(--ink-3);
	}
	.binput input {
		width: 100%;
		background: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--space-5) var(--space-6) var(--space-5) var(--space-10);
		font-size: var(--text-panel);
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-family: inherit;
	}
	.binput input:focus-visible {
		outline: none;
		border-color: var(--lav);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lav) 30%, transparent);
	}
	.err {
		color: var(--crit-text);
		font-size: var(--text-secondary);
		margin: 0;
	}
	@media (max-width: 720px) {
		.oneby {
			grid-template-columns: 1fr;
		}
	}
</style>
