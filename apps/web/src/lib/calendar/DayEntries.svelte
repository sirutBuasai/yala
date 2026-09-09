<script lang="ts">
	// The selected day's entries, one section per kind. Content only: the day's name, its totals and
	// the add button are the PANE's header (see `CalendarPanes`), and the pane owns the height — which
	// is why there is no sizing here at all. This file used to carry a careful `flex: 1 1 0` and an
	// overflow cap to stop a busy day pushing the calendar's row taller; the pane's height mode says
	// that now, and says it for every list in the app rather than for this one.
	import type { DayCell } from '$lib/calendar/days';
	import Empty from '$lib/ui/Empty.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import TransactionList from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';

	interface Props {
		day: DayCell;
		oneditTransaction: (locator: string) => void;
		oneditPaycheck: (locator: string) => void;
		oneditTransfer: (locator: string) => void;
	}
	let { day, oneditTransaction, oneditPaycheck, oneditTransfer }: Props = $props();

	// Newest first, matching every other transaction list in the app.
	const txns = $derived([...day.txns].sort((a, b) => b.date.localeCompare(a.date)));
	const empty = $derived(!day.pays.length && !day.xfers.length && !txns.length);
</script>

{#if day.pays.length}
	<div class="daysec">
		<h4 class="dslabel">Paychecks</h4>
		<PaycheckList paychecks={day.pays} onedit={oneditPaycheck} showDate={false} />
	</div>
{/if}

{#if day.xfers.length}
	<div class="daysec">
		<h4 class="dslabel">Bill pay &amp; transfers</h4>
		<TransferList transfers={day.xfers} onedit={oneditTransfer} showDate={false} />
	</div>
{/if}

{#if txns.length}
	<div class="daysec">
		<h4 class="dslabel">Transactions</h4>
		<TransactionList transactions={txns} onedit={oneditTransaction} showDate={false} />
	</div>
{/if}

{#if empty}
	<Empty>No activity this day. Add an entry above.</Empty>
{/if}

<style>
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
</style>
