<script lang="ts">
	// The month's history as a board pane: one list of every entry, filters over it, and a summary of
	// whatever the filters leave. The filters are the caller's, since they live in the URL.
	import type { Label } from '$lib/ui/label';
	import { live, words } from '$lib/ui/label';
	import type { EntryType, HistoryEntry, HistoryFilter } from '$lib/lists/history';
	import { accountsOf, filterHistory, sortHistory, summarize } from '$lib/lists/history';
	import { TXN_SORTS, type TxnSort } from '$lib/lists/TransactionList.svelte';
	import { formatAccount, money } from '$lib/utils/format';
	import { formatDelta, MONEY } from '$lib/data/primitives';
	import { dateShort } from '$lib/utils/format';
	import { sumBy } from '$lib/utils/num';
	import { oneOf, Pref } from '$lib/utils/persist.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import SortMenu from '$lib/lists/SortMenu.svelte';
	import HistoryList from '$lib/lists/HistoryList.svelte';
	import Amount from '$lib/ui/Amount.svelte';
	import Empty from '$lib/ui/Empty.svelte';

	interface Props {
		id: string;
		entries: HistoryEntry[];
		filter: HistoryFilter;
		onfilter: (patch: Partial<HistoryFilter>) => void;
		/** Each category's monthly average, for the summary when the rows left share one category. */
		averages: Record<string, number>;
		currency: string;
		/** The month's name, for the caption. */
		period: string;
		onedit: (entry: HistoryEntry) => void;
		onadd: () => void;
	}
	let { id, entries, filter, onfilter, averages, currency, period, onedit, onadd }: Props =
		$props();

	const TYPES: { id: EntryType | 'all'; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'txn', label: 'Transactions' },
		{ id: 'pay', label: 'Paychecks' },
		{ id: 'xfer', label: 'Bill pay' }
	];

	// Offered from this month's rows, so a choice can never filter to nothing.
	const categories = $derived([
		'',
		...[...new Set(entries.flatMap((e) => (e.type === 'txn' ? [e.row.category] : [])))].sort()
	]);
	const accounts = $derived([
		'',
		...[...new Set(entries.flatMap(accountsOf))].sort((a, b) =>
			formatAccount(a).localeCompare(formatAccount(b))
		)
	]);

	// Validated against the sort fields that exist, so a renamed one falls back to date order.
	const sort = new Pref<TxnSort>('txn-sort', 'date', oneOf(TXN_SORTS.map((s) => s.key)));
	const sortDir = new Pref<'asc' | 'desc'>('txn-sort-dir', 'desc', oneOf(['asc', 'desc'] as const));

	const shown = $derived(sortHistory(filterHistory(entries, filter), sort.value, sortDir.value));
	const summary = $derived(summarize(shown));
	const vsAverage = $derived(
		summary.category && summary.spent !== null && averages[summary.category] !== undefined
			? summary.spent - averages[summary.category]!
			: null
	);

	/** Days in order, each with its rows, while the list is in date order; one ungrouped run otherwise. */
	const groups = $derived.by(() => {
		if (sort.value !== 'date') return null;
		const days: { date: string; rows: HistoryEntry[] }[] = [];
		for (const e of shown) {
			const last = days[days.length - 1];
			if (last?.date === e.date) last.rows.push(e);
			else days.push({ date: e.date, rows: [e] });
		}
		return days;
	});
	const spentOn = (rows: HistoryEntry[]) =>
		sumBy(rows, (e) => (e.type === 'txn' ? e.row.amount : 0));

	const filtered = $derived(shown.length !== entries.length);
	const caption = $derived<Label>(
		live(
			filtered
				? `${shown.length} of ${entries.length} in ${period}`
				: `${entries.length} in ${period}`
		)
	);
	const unit = $derived(MONEY(currency));
</script>

<Pane {id} title={words('Transaction history')} {caption}>
	{#snippet actions()}
		<button class="btn-ghost" onclick={onadd}>+ Add</button>
	{/snippet}

	<!-- Pinned while the list scrolls, bled to the card's edges so rows don't show through, then padded back. -->
	<div class="pinned bleed-x">
		<div class="filters">
			<Segmented
				options={TYPES}
				value={filter.type ?? 'all'}
				onchange={(t) => onfilter({ type: t === 'all' ? null : t })}
				ariaLabel="Entry type"
			/>
			<div class="menu first">
				<Select
					ariaLabel="Category"
					value={filter.category ?? ''}
					options={categories}
					optionLabel={(c) => c || 'Any category'}
					onchange={(c) => onfilter({ category: c || null })}
					placeholder="Any category"
				/>
			</div>
			<div class="menu">
				<Select
					ariaLabel="Account"
					value={filter.account ?? ''}
					options={accounts}
					optionLabel={(a) => (a ? formatAccount(a) : 'Any account')}
					onchange={(a) => onfilter({ account: a || null })}
					placeholder="Any account"
				/>
			</div>
		</div>

		{#if shown.length}
			<dl class="summary">
				{#if summary.spent !== null}
					<div>
						<dt class="cap">Spent</dt>
						<dd><Amount value={summary.spent} sign="refund" /></dd>
					</div>
				{/if}
				{#if summary.takehome !== null}
					<div>
						<dt class="cap">Take-home</dt>
						<dd><Amount value={summary.takehome} sign="credit" /></dd>
					</div>
				{/if}
				{#if summary.billpay !== null}
					<div>
						<dt class="cap">Bill pay &amp; transfers</dt>
						<dd><Amount value={summary.billpay} /></dd>
					</div>
				{/if}
				{#if vsAverage !== null}
					<div>
						<dt class="cap">vs your average</dt>
						<dd class:over={vsAverage > 0} class:under={vsAverage < 0}>
							{formatDelta(vsAverage, unit)}
						</dd>
					</div>
				{/if}
			</dl>
		{/if}

		<div class="tools">
			<input
				class="field-input search"
				type="search"
				placeholder="Find an entry"
				aria-label="Find an entry"
				value={filter.search}
				oninput={(e) => onfilter({ search: e.currentTarget.value })}
			/>
			<SortMenu
				fields={TXN_SORTS}
				bind:sortKey={() => sort.value, (v) => (sort.value = v)}
				bind:sortDir={() => sortDir.value, (v) => (sortDir.value = v)}
			/>
		</div>
	</div>

	{#if shown.length}
		{#if groups}
			{#each groups as g (g.date)}
				{@const spent = spentOn(g.rows)}
				<div class="day">
					<span>{dateShort(g.date)}</span>
					<span>{spent ? money(spent) : ''}</span>
				</div>
				<HistoryList entries={g.rows} {onedit} showDate={false} />
			{/each}
		{:else}
			<HistoryList entries={shown} {onedit} />
		{/if}
	{:else}
		<Empty>{entries.length ? 'Nothing matches these filters.' : 'No entries this month.'}</Empty>
	{/if}
</Pane>

<style>
	.filters,
	.tools {
		display: flex;
		gap: var(--gap-row);
		align-items: center;
		flex-wrap: wrap;
	}
	.pinned {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-3) var(--pad-card-x) var(--space-4);
		background: var(--surface);
	}
	/* Wide enough for most names; a longer one ellipsizes in the trigger and shows whole in the list. */
	.menu {
		width: 11rem;
		flex: none;
	}
	/* The menus hold the right edge while the type chips hold the left. */
	.menu.first {
		margin-left: auto;
	}
	.tools {
		justify-content: space-between;
	}
	/* Runs up to the sort control, so the row spans the pane like the filters above it. */
	.search {
		flex: 1 1 auto;
		min-width: 0;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-11);
		margin: 0;
		padding: var(--space-5) var(--space-7);
		border-radius: var(--radius-md);
		background: var(--inset);
	}
	.summary div {
		display: grid;
		gap: var(--space-1);
	}
	.summary dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-amount);
		font-variant-numeric: tabular-nums;
	}
	.summary dd.over {
		color: var(--crit-text);
	}
	.summary dd.under {
		color: var(--good-text);
	}
	.day {
		display: flex;
		justify-content: space-between;
		padding: var(--space-3) 0;
		margin-top: var(--space-4);
		border-bottom: 1px solid var(--border);
		color: var(--ink-3);
		font-size: var(--text-meta);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
</style>
