<script lang="ts">
	import type { DashboardData } from '$lib/types';
	import type { AccountsInfo } from '$lib/data';
	import { MONTHS, money, moneyCompact } from '$lib/format';
	import { categoryVar } from '$lib/theme';
	import ViewHeader from './ViewHeader.svelte';
	import MonthNav from './MonthNav.svelte';
	import Overlay from './Overlay.svelte';
	import TransactionList from './TransactionList.svelte';
	import TransactionForm from './TransactionForm.svelte';
	import PaycheckForm from './PaycheckForm.svelte';

	interface Props {
		data: DashboardData;
		edit: boolean;
		accounts: AccountsInfo | null;
		onsaved: () => void;
	}
	let { data, edit, accounts, onsaved }: Props = $props();

	const latestData = $derived(
		data.meta.month_keys.length ? [...data.meta.month_keys].sort().at(-1)! : ''
	);

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
			const spent = txns.reduce((a, t) => a + t.amount, 0);
			const income = pays.reduce((a, p) => a + p.net, 0);
			// Rank the day's categories by total spend, show the top 3 as dots, and flag any extra.
			const catTotals = new Map<string, number>();
			for (const t of txns) catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount);
			const ranked = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
			const cats = ranked.slice(0, 3);
			const more = ranked.length > 3;
			const pending = txns.some((t) => t.pending);
			out.push({ day: d, iso, txns, pays, spent, income, cats, more, pending });
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

	let showAdd = $state(false);
	let showPaycheck = $state(false);
	let editingLocator = $state<string | null>(null);
	let editingPaycheck = $state<string | null>(null);

	function afterSave() {
		showAdd = false;
		showPaycheck = false;
		editingLocator = null;
		editingPaycheck = null;
		onsaved();
	}
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
					<span class="dn"
						>{c.day}{#if c.pending}<span class="pend">●</span>{/if}</span
					>
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
						<button class="btn-ghost" onclick={() => (showAdd = true)}>+ Transaction</button>
						<button class="btn-ghost" onclick={() => (showPaycheck = true)}>+ Paycheck</button>
					</div>
				{/if}
			</div>

			{#if selected.pays.length}
				<div class="paylist">
					{#each selected.pays as p (p.locator)}
						<svelte:element
							this={edit ? 'button' : 'div'}
							class="payrow"
							class:clickable={edit}
							type={edit ? 'button' : undefined}
							role={edit ? 'button' : undefined}
							onclick={edit ? () => (editingPaycheck = p.locator) : undefined}
						>
							<span class="dot pay"></span>
							<span class="main">
								<span class="title">Paycheck</span>
								<span class="cat">gross {money(p.gross)} · take-home {money(p.take_home)}</span>
							</span>
							<span class="amt pos">+{money(p.net)}</span>
						</svelte:element>
					{/each}
				</div>
			{/if}

			{#if selectedTxns.length}
				<TransactionList
					transactions={selectedTxns}
					{edit}
					onedit={(l) => (editingLocator = l)}
					showDate={false}
				/>
			{:else if !selected.pays.length}
				<p class="note">
					No activity this day.{#if edit}&nbsp;Add a transaction or paycheck above.{/if}
				</p>
			{/if}
		{/if}
	</aside>
</div>

{#if showAdd && accounts && selected}
	<Overlay
		title="Add transaction · {MONTHS[mm - 1]} {selected.day}"
		onclose={() => (showAdd = false)}
	>
		<TransactionForm {accounts} presetDate={selected.iso} onsaved={afterSave} />
	</Overlay>
{/if}

{#if showPaycheck && accounts && selected}
	<Overlay
		title="Add paycheck · {MONTHS[mm - 1]} {selected.day}"
		onclose={() => (showPaycheck = false)}
	>
		<PaycheckForm {accounts} presetDate={selected.iso} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingLocator && accounts}
	<Overlay title="Edit transaction" onclose={() => (editingLocator = null)}>
		<TransactionForm locator={editingLocator} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingPaycheck && accounts}
	<Overlay title="Edit paycheck" onclose={() => (editingPaycheck = null)}>
		<PaycheckForm locator={editingPaycheck} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

<style>
	.calwrap {
		display: grid;
		grid-template-columns: 1.7fr 1fr;
		gap: 14px;
		align-items: start;
	}
	.cal-head {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 8px;
		margin-bottom: 8px;
		color: var(--ink-3);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		text-align: center;
	}
	.cal {
		/* Role colors swap by theme: dark → purple selection / gold pending;
		   light → gold selection / purple pending. */
		--sel: var(--lav);
		--pend: var(--gold);
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 8px;
	}
	:global(:root[data-theme='light']) .cal {
		--sel: var(--gold);
		--pend: var(--lav);
	}
	.cell {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		min-height: 90px;
		padding: 8px;
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
		font-size: 12px;
		color: var(--ink-2);
		font-weight: 600;
	}
	.cell .pend {
		color: var(--pend);
		font-size: 8px;
		margin-left: 5px;
		vertical-align: middle;
	}
	.cell .cdots {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: 2px;
		flex-wrap: wrap;
		max-width: 46px;
		justify-content: flex-end;
	}
	.cell .cdots i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		display: block;
	}
	.cell .cdots .more {
		font-size: 9px;
		font-weight: 700;
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
		line-height: 1.2;
	}
	/* Income and spending render identically — same size and weight — so the only signal is
	   the color: income is green, spending inherits the default ink. */
	.cell .camounts span {
		font-size: 10px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.cell .inc {
		color: var(--good-text);
	}
	.side {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px 20px;
		box-shadow: var(--shadow);
	}
	.dphead {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.dphead h3 {
		margin: 0 0 2px;
		font-size: 16px;
		font-weight: 600;
	}
	.dphead .cap {
		color: var(--ink-3);
		font-size: 12px;
		margin: 0;
	}
	.dpactions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.pos {
		color: var(--good-text);
	}
	.paylist {
		display: flex;
		flex-direction: column;
		margin-bottom: 6px;
	}
	.payrow {
		display: grid;
		grid-template-columns: 10px 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 8px 4px;
		border-bottom: 1px solid var(--border);
		width: 100%;
		background: none;
		border-left: 0;
		border-right: 0;
		border-top: 0;
		color: inherit;
		font: inherit;
		text-align: left;
	}
	.payrow.clickable {
		cursor: pointer;
		border-radius: 8px;
	}
	.payrow.clickable:hover {
		background: color-mix(in srgb, var(--lav) 9%, transparent);
	}
	.payrow .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.payrow .dot.pay {
		background: var(--saved);
	}
	.payrow .main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.payrow .title {
		font-size: 13px;
		font-weight: 500;
	}
	.payrow .cat {
		color: var(--ink-3);
		font-size: 10.5px;
	}
	.payrow .amt {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 13px;
	}
	.note {
		color: var(--ink-3);
		font-size: 12.5px;
	}
	@media (max-width: 900px) {
		.calwrap {
			grid-template-columns: 1fr;
		}
	}
</style>
