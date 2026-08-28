<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { MONTHS, money, moneyCompact } from '$lib/utils/format';
	import { categoryVar } from '$lib/utils/theme';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import MonthNav from '$lib/nav/MonthNav.svelte';
	import TransactionList from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';
	import Empty from '$lib/layout/Empty.svelte';

	interface Props {
		data: DashboardData;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, edit, accounts, onsaved }: Props = $props();

	const latestData = $derived([...data.meta.month_keys].sort().at(-1) ?? '');

	// The month on screen. Empty `viewKey` means "follow the latest transaction month"; once the
	// user navigates or picks, `viewKey` pins the choice. Recreating the tab resets to latest.
	let viewKey = $state('');
	const key = $derived(viewKey || latestData);

	const md = $derived(data.months[key]);

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const dayOf = (date: string) => +date.slice(8, 10);

	const yy = $derived(+key.slice(0, 4));
	const mm = $derived(+key.slice(5, 7));
	// getDay() on the numeric-arg Date is the real weekday of the 1st; days-in-month is day 0 of
	// the following month. Transaction days come straight from the ISO string (no Date parsing),
	// so a "YYYY-MM-DD" always lands on its true weekday cell.
	const firstWeekday = $derived(new Date(yy, mm - 1, 1).getDay());
	const daysInMonth = $derived(new Date(yy, mm, 0).getDate());

	interface DayCell {
		day: number;
		iso: string;
		txns: DashboardData['months'][string]['transactions'];
		pays: DashboardData['months'][string]['paychecks'];
		xfers: NonNullable<DashboardData['months'][string]['transfers']>;
		spent: number;
		income: number;
		/** Up to 3 categories, ranked by that day's spend in each. */
		cats: string[];
		/** True when the day has more than 3 categories (render a "+" after the dots). */
		more: boolean;
		/** Has at least one not-yet-reconciled (pending) transaction. */
		pending: boolean;
	}

	const days = $derived.by<DayCell[]>(() => {
		const out: DayCell[] = [];
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = `${key}-${String(d).padStart(2, '0')}`;
			const txns = (md?.transactions ?? []).filter((t) => dayOf(t.date) === d);
			const pays = (md?.paychecks ?? []).filter((p) => dayOf(p.date) === d);
			const xfers = (md?.transfers ?? []).filter((t) => dayOf(t.date) === d);
			const spent = txns.reduce((a, t) => a + t.amount, 0);
			const income = pays.reduce((a, p) => a + p.net, 0);
			// Rank the day's categories by total spend, show the top 3 as dots, and flag any extra.
			const catTotals = new Map<string, number>();
			for (const t of txns) catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount);
			const ranked = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
			const cats = ranked.slice(0, 3);
			const more = ranked.length > 3;
			const pending = txns.some((t) => t.pending) || xfers.some((t) => t.pending);
			out.push({ day: d, iso, txns, pays, xfers, spent, income, cats, more, pending });
		}
		return out;
	});

	let selectedDay = $state<number | null>(null);

	// Reset the selection to the month's most recent active day (or the 1st) whenever the shown
	// month changes or the selection falls out of range.
	$effect(() => {
		const dim = daysInMonth;
		let last = 0;
		for (const t of md?.transactions ?? []) last = Math.max(last, dayOf(t.date));
		for (const p of md?.paychecks ?? []) last = Math.max(last, dayOf(p.date));
		const fallback = last || 1;
		if (selectedDay == null || selectedDay > dim) selectedDay = fallback;
	});

	const selected = $derived(selectedDay ? days[selectedDay - 1] : undefined);
	const selectedTxns = $derived(
		selected ? [...selected.txns].sort((a, b) => b.date.localeCompare(a.date)) : []
	);

	let modals: ReturnType<typeof EditModals>;
</script>

<ViewHeader title="Calendar">
	<MonthNav value={key} monthKeys={data.meta.month_keys} onchange={(k) => (viewKey = k)} />
</ViewHeader>

<div class="calwrap">
	<section class="card">
		<div class="cal-head">
			{#each WEEKDAYS as w (w)}<span>{w}</span>{/each}
		</div>
		<div class="cal">
			{#each Array(firstWeekday), i (i)}
				<div class="cell blank"></div>
			{/each}
			{#each days as c (c.day)}
				<button
					type="button"
					class="cell"
					class:sel={selectedDay === c.day}
					class:pending={c.pending}
					title={c.pending ? 'Pending — click to reconcile' : undefined}
					onclick={() => (selectedDay = c.day)}
				>
					<span class="dn">{c.day}</span>
					{#if c.cats.length}
						<span class="cdots">
							{#each c.cats as cat (cat)}<i style:background={categoryVar(cat)}></i>{/each}
							{#if c.more}<span class="more">+</span>{/if}
						</span>
					{/if}
					{#if c.income || c.txns.length}
						<span class="camounts">
							{#if c.income}<span class="inc">+{moneyCompact(c.income)}</span>{/if}
							{#if c.txns.length}<span class="csum">{moneyCompact(c.spent)}</span>{/if}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</section>

	<aside class="side">
		{#if selected}
			<div class="dphead">
				<div>
					<h3 class="serif">{MONTHS[mm - 1]} {selected.day}, {yy}</h3>
					<p class="cap">
						{selected.txns.length} transaction{selected.txns.length !== 1 ? 's' : ''} · {money(
							selected.spent
						)}{#if selected.income}
							· <span class="pos">+{money(selected.income)} income</span>{/if}
					</p>
				</div>
				{#if edit}
					<div class="dpactions">
						<button class="btn-ghost" onclick={() => modals.add()}>+ Add entry</button>
					</div>
				{/if}
			</div>

			{#if selected.pays.length}
				<div class="daysec">
					<h4 class="dslabel">Paychecks</h4>
					<PaycheckList
						paychecks={selected.pays}
						{edit}
						onedit={(l) => modals.editPaycheck(l)}
						showDate={false}
					/>
				</div>
			{/if}

			{#if selected.xfers.length}
				<div class="daysec">
					<h4 class="dslabel">Bill pay &amp; transfers</h4>
					<TransferList
						transfers={selected.xfers}
						{edit}
						onedit={(l) => modals.editTransfer(l)}
						showDate={false}
					/>
				</div>
			{/if}

			{#if selectedTxns.length}
				<div class="daysec">
					<h4 class="dslabel">Transactions</h4>
					<TransactionList
						transactions={selectedTxns}
						{edit}
						onedit={(l) => modals.editTransaction(l)}
						showDate={false}
					/>
				</div>
			{/if}

			{#if !selected.pays.length && !selectedTxns.length && !selected.xfers.length}
				<Empty
					>No activity this day.{#if edit}&nbsp;Add an entry above.{/if}</Empty
				>
			{/if}
		{/if}
	</aside>
</div>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	presetDate={selected?.iso}
	addTitle={selected ? `Add entry · ${MONTHS[mm - 1]} ${selected.day}` : 'Add entry'}
/>

<style>
	.calwrap {
		display: grid;
		grid-template-columns: 1.7fr 1fr;
		gap: var(--gap-grid);
		align-items: start;
	}
	.cal-head {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: var(--gap-row);
		margin-bottom: var(--gap-row);
		color: var(--ink-3);
		font-size: var(--text-column);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		text-align: center;
	}
	.cal {
		/* Role colors swap by theme: dark → purple selection / gold pending;
		   light → gold selection / purple pending. */
		--sel: var(--lav);
		--pend: var(--gold);
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: var(--gap-row);
	}
	:global(:root[data-theme='light']) .cal {
		--sel: var(--gold);
		--pend: var(--lav);
	}
	.cell {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		min-height: 90px;
		padding: var(--pad-cell);
		cursor: pointer;
		position: relative;
		text-align: left;
		font: inherit;
		color: inherit;
		transition:
			border-color 0.1s,
			transform 0.06s;
	}
	.cell:hover {
		border-color: var(--sel);
	}
	.cell.blank {
		background: none;
		border: 0;
		cursor: default;
		min-height: 0;
	}
	/* Pending (unreconciled) day: a persistent, filled color cue that survives hover.
	   Declared before .cell.sel so a selected pending day still gets the selection ring. */
	.cell.pending {
		border-color: var(--pend);
		background: color-mix(in srgb, var(--pend) 13%, var(--surface-2));
	}
	.cell.sel {
		border-color: var(--sel);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--sel) 35%, transparent);
	}
	.cell .dn {
		position: absolute;
		top: 8px;
		left: 8px;
		font-size: var(--text-secondary);
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
	}
	.cell .cdots {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		max-width: 46px;
		justify-content: flex-end;
	}
	.cell .cdots i {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-pill);
		display: block;
	}
	.cell .cdots .more {
		font-size: var(--text-micro);
		font-weight: var(--fw-bold);
		line-height: 1;
		color: var(--ink-3);
	}
	/* Amounts stack in the bottom-right corner (income above spending) so a high-income,
	   high-spending day never has the two figures collide. A day with only one shows just that. */
	.cell .camounts {
		position: absolute;
		bottom: 8px;
		right: 8px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		line-height: var(--lh-tight);
	}
	/* Income and spending render identically — same size and weight — so the only signal is
	   the color: income is green, spending inherits the default ink. */
	.cell .camounts span {
		font-size: var(--text-micro);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
	.cell .inc {
		color: var(--good-text);
	}
	.side {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--pad-card);
		box-shadow: var(--shadow);
	}
	.dphead {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--gap-field);
		margin-bottom: var(--gap-field);
		flex-wrap: wrap;
	}
	.dphead h3 {
		margin: 0 0 var(--space-1);
		font-size: var(--text-panel);
		font-weight: var(--fw-semibold);
	}
	.dphead .cap {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		margin: 0;
	}
	.dpactions {
		display: flex;
		gap: var(--gap-inline);
		flex-wrap: wrap;
	}
	.pos {
		color: var(--good-text);
	}
	.daysec + .daysec {
		margin-top: var(--space-7);
		padding-top: var(--space-7);
		border-top: 1px solid var(--border);
	}
	.dslabel {
		margin: 0 0 var(--space-4);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wider);
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
	}
	@media (max-width: 900px) {
		.calwrap {
			grid-template-columns: 1fr;
		}
	}
</style>
