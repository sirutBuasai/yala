<script lang="ts">
	// The month calendar + day-detail panel, extracted so both the Home hub and the Calendar tab
	// share one implementation. Owns its own month selection and selected-day state, and the
	// EditModals overlay for adding/editing the selected day's entries.
	import type { Snippet } from 'svelte';
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import { MONTHS, money, moneyCompact } from '$lib/utils/format';
	import { categoryVar } from '$lib/utils/theme';
	import TransactionList from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import EditModals from '$lib/forms/EditModals.svelte';
	import Empty from '$lib/layout/Empty.svelte';
	import Pane from '$lib/layout/Pane.svelte';
	import Split from '$lib/layout/Split.svelte';

	interface Props {
		data: DashboardData;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
		/** The month on screen, "YYYY-MM" — controlled by the parent so the scope can be shared. */
		monthKey: string;
		/** Optional pane pinned under the day panel in the rail. */
		railBelow?: Snippet;
		/** How many list rows tall the day panel may grow before it scrolls. Chosen so the panel plus
		    anything in `railBelow` stays close to the calendar's own height. */
		dayRows?: number;
	}
	let { data, edit, accounts, onsaved, monthKey, railBelow, dayRows = 6 }: Props = $props();

	const key = $derived(monthKey);

	const md = $derived(data.months[key]);

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const dayOf = (date: string) => +date.slice(8, 10);

	const yy = $derived(+key.slice(0, 4));
	const mm = $derived(+key.slice(5, 7));
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
		cats: string[];
		more: boolean;
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
	// The month a selection was last made for. Without it the first render — which runs before the
	// parent has resolved a month — would settle on the 1st and then look "already chosen", so the
	// real month's latest activity never got picked.
	let pickedFor = $state('');

	// Open each month on its most recent activity (the day you'd be logging against), keeping a
	// deliberate choice until the month actually changes.
	$effect(() => {
		if (!key) return;
		const dim = daysInMonth;
		if (pickedFor === key && selectedDay != null && selectedDay <= dim) return;

		let last = 0;
		for (const t of md?.transactions ?? []) last = Math.max(last, dayOf(t.date));
		for (const p of md?.paychecks ?? []) last = Math.max(last, dayOf(p.date));
		for (const x of md?.transfers ?? []) last = Math.max(last, dayOf(x.date));
		selectedDay = Math.min(last || 1, dim);
		pickedFor = key;
	});

	const selected = $derived(selectedDay ? days[selectedDay - 1] : undefined);
	const selectedTxns = $derived(
		selected ? [...selected.txns].sort((a, b) => b.date.localeCompare(a.date)) : []
	);

	// The grid is laid out a week at a time so each row can carry its own spend total in the gutter
	// beside it. Leading/trailing nulls are the blank cells either end of the month.
	interface CalRow {
		cells: (DayCell | null)[];
		total: number;
	}
	const calRows = $derived.by<CalRow[]>(() => {
		const slots: (DayCell | null)[] = [...Array(firstWeekday).fill(null), ...days];
		while (slots.length % 7) slots.push(null);
		const out: CalRow[] = [];
		for (let i = 0; i < slots.length; i += 7) {
			const cells = slots.slice(i, i + 7);
			out.push({ cells, total: cells.reduce((s, c) => s + (c?.spent ?? 0), 0) });
		}
		return out;
	});
	// Bars are scaled against the busiest week, so the column reads as a chart of the month.
	const peakWeek = $derived(Math.max(...calRows.map((r) => r.total), 1));

	let modals: ReturnType<typeof EditModals>;
</script>

<Split stretch>
	{#snippet main()}
		<Pane title="Log activity">
			<div class="cal-head">
				{#each WEEKDAYS as w (w)}<span>{w}</span>{/each}
				<span class="wkhd">Week</span>
			</div>
			<div class="cal">
				{#each calRows as row, ri (ri)}
					{#each row.cells as c, ci (ci)}
						{#if c}
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
						{:else}
							<div class="cell blank"></div>
						{/if}
					{/each}
					<div class="wkcell">
						<span class="wbar"
							><i style:height={`${Math.round((row.total / peakWeek) * 100)}%`}></i></span
						>
						<span class="wval">{row.total ? moneyCompact(row.total) : '—'}</span>
					</div>
				{/each}
			</div>
		</Pane>
	{/snippet}

	{#snippet rail()}
		<aside class="side" style:--day-rows={dayRows}>
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

				<!-- The day's entries scroll inside the panel, so a busy day can't stretch the row or
			     crowd what sits below the calendar. -->
				<div class="dpbody">
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
				</div>
			{/if}
		</aside>
		{@render railBelow?.()}
	{/snippet}
</Split>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	kinds={['transaction', 'paycheck', 'transfer']}
	presetDate={selected?.iso}
	addTitle={selected ? `Add entry · ${MONTHS[mm - 1]} ${selected.day}` : 'Add entry'}
/>

<style>
	/* One ruler for the weekday header and the day grid: seven day columns plus the week gutter. */
	.cal-head,
	.cal {
		--wk-gutter: 3.25rem;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr)) var(--wk-gutter);
		gap: var(--gap-row);
	}
	.cal-head {
		/* Pane leaves only its title's trailing margin, which is too tight above the weekday row. */
		margin-top: var(--space-6);
		margin-bottom: var(--gap-row);
		color: var(--ink-3);
		font-size: var(--text-column);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		text-align: center;
	}
	.cal-head .wkhd {
		text-align: left;
		padding-left: var(--gap-row);
	}
	.cal {
		--sel: var(--lav);
		--pend: var(--gold);
	}
	/* Weekly spend: a bar grown from the bottom of its row, topping out at the cell height, so the
	   gutter reads as a bar chart of the month's weeks. */
	.wkcell {
		display: flex;
		align-items: stretch;
		gap: var(--gap-row);
		padding-left: var(--gap-row);
		min-width: 0;
	}
	.wkcell .wbar {
		width: 7px;
		flex: none;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--inset) 65%, transparent);
		display: flex;
		align-items: flex-end;
		overflow: hidden;
	}
	.wkcell .wbar i {
		display: block;
		width: 100%;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--lav) 62%, transparent);
	}
	.wkcell .wval {
		align-self: center;
		font-size: var(--text-micro);
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
		white-space: nowrap;
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
	.cell .camounts span {
		font-size: var(--text-micro);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
	.cell .inc {
		color: var(--good-text);
	}
	/* The panel is capped at a whole number of list rows and scrolls past that, so a heavy day never
	   changes the page's shape. The cap is in row-height tokens, not pixels, so it tracks row density. */
	.side {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--pad-card);
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: none;
		overflow: hidden;
	}
	.dpbody {
		min-height: 0;
		max-height: calc(var(--listrow-h) * var(--day-rows));
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		/* re-assert the card's own inset so a bled list row still lines up inside the scroller */
		margin-inline: calc(-1 * var(--pad-card-x));
		padding-inline: var(--pad-card-x);
	}
	.dphead {
		flex: none;
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
	/* Stacked (single-column) layout: nothing constrains the panel's height, so let it run. */
	@media (max-width: 70rem) {
		.side {
			overflow: visible;
		}
		.dpbody {
			overflow: visible;
		}
	}
</style>
