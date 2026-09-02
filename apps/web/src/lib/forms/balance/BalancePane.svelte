<script lang="ts">
	// "Log balances" pane — used on Home (and later Net Worth). It is BOTH a logger and a viewer:
	// the account list scrolls freely with the selected account emphasized by weight + size (no
	// fixed selection box), and it reflects the SELECTED month. Changing the month (via the shared
	// header stepper) shows that month's recorded balance + adjustment for each account and
	// pre-fills the input with it; saving edits that account's balance for that month.
	import type { DashboardData } from '$lib/data/types';
	import { type AccountsInfo, logBalance, networthAt } from '$lib/data/load';
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

	// Per-account values + adjustments AS OF the selected month (fetched live). Falls back to the
	// current snapshot from data.json in view mode.
	let asOfVals = $state<Map<string, number>>(new Map());
	let asOfAdj = $state<Map<string, number>>(new Map());
	let loading = $state(false);

	/** Last day of "YYYY-MM" as an ISO date — the snapshot's assertion date. */
	function lastDayOf(key: string): string {
		const [y, m] = key.split('-').map(Number);
		if (!y || !m) return '';
		const d = new Date(y, m, 0).getDate();
		return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	async function fetchAsOf() {
		if (!edit || !monthKey) {
			asOfVals = new Map((data.networth?.accounts ?? []).map((a) => [a.account, a.value]));
			asOfAdj = new Map((data.networth?.adjustments ?? []).map((a) => [a.account, a.value]));
			return;
		}
		loading = true;
		const res = await networthAt(lastDayOf(monthKey));
		if (res) {
			asOfVals = new Map(res.accounts.map((a) => [a.account, a.value]));
			asOfAdj = new Map(res.adjustments.map((a) => [a.account, a.value]));
		}
		loading = false;
	}
	// Refetch whenever the month or edit-mode changes.
	$effect(() => {
		monthKey;
		edit;
		void fetchAsOf();
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

	// A month later than the last logged snapshot has no real balance yet — the fetched value is
	// only carried forward — so treat it as "future" and don't pre-fill the input from it.
	const lastSnapMonth = $derived(data.networth?.series?.at(-1)?.month ?? '');
	const isFuture = $derived(!!monthKey && !!lastSnapMonth && monthKey > lastSnapMonth);

	// An account's dot is green when it already has a balance for this month (a default fill) or was
	// just saved — persisting regardless of scroll. Otherwise the focal account is purple and the
	// rest are grey (handled in CSS via .cur).
	const filled = (acct: string) => saved.has(acct) || (!isFuture && asOfVals.get(acct) != null);

	// Reset the session ✓ cues when the month changes (a fresh month to log/edit).
	$effect(() => {
		monthKey;
		saved = new Set();
	});

	// Pre-fill the input with the selected account's recorded balance for the month, whenever the
	// account or the fetched values change. (Doesn't read amountStr, so typing is never clobbered.)
	$effect(() => {
		const c = current;
		const v = c != null ? asOfVals.get(c) : undefined;
		amountStr = v != null && !isFuture ? String(v) : '';
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
		const e = await logBalance(current, n, lastDayOf(monthKey));
		busy = false;
		if (e) {
			err = e;
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
				<p class="cap">Showing <b>{monthLabel(monthKey)}</b></p>
			</div>
			{#if saved.size}<span class="progress">{saved.size} saved</span>{/if}
		</div>

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
							<dt>Recorded</dt>
							<dd class:muted={isFuture || recorded == null}>
								{#if loading}…{:else if !isFuture && recorded != null}{money(recorded)}{:else}—{/if}
							</dd>
						</div>
						<div>
							<dt>Adjustment</dt>
							<dd class:muted={!(adj ?? 0)}>
								{#if isFuture || adj == null || adj === 0}—{:else}{money(adj)}{/if}
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
							<span class="label">Balance · {monthLabel(monthKey)}</span>
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
						<button class="btn-primary save" onclick={save} disabled={busy}>
							{busy ? 'Saving…' : 'Save →'}
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
