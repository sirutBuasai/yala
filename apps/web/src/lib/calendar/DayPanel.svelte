<script lang="ts">
	// The selected day's entries, as the rail beside the calendar: a header naming the day and its
	// totals, then one section per entry kind.
	//
	// The sizing is the load-bearing part. This panel takes whatever height the CALENDAR left over
	// (`flex: 1 1 0`) and scrolls inside it, rather than growing to fit a busy day — which is what
	// used to push the rail past the calendar and drag the rest of the page down with it.
	import type { DayCell } from '$lib/calendar/days';
	import { money, MONTHS } from '$lib/utils/format';
	import Empty from '$lib/ui/Empty.svelte';
	import PaycheckList from '$lib/lists/PaycheckList.svelte';
	import TransactionList from '$lib/lists/TransactionList.svelte';
	import TransferList from '$lib/lists/TransferList.svelte';

	interface Props {
		day: DayCell;
		/** 1-based month, for the heading. */
		month: number;
		year: number;
		edit: boolean;
		onadd: () => void;
		oneditTransaction: (locator: string) => void;
		oneditPaycheck: (locator: string) => void;
		oneditTransfer: (locator: string) => void;
	}
	let { day, month, year, edit, onadd, oneditTransaction, oneditPaycheck, oneditTransfer }: Props =
		$props();

	// Newest first, matching every other transaction list in the app.
	const txns = $derived([...day.txns].sort((a, b) => b.date.localeCompare(a.date)));
	const empty = $derived(!day.pays.length && !day.xfers.length && !txns.length);
</script>

<aside class="card side">
	<div class="dphead">
		<div>
			<h3 class="serif">{MONTHS[month - 1]} {day.day}, {year}</h3>
			<p class="cap">
				{day.txns.length} transaction{day.txns.length !== 1 ? 's' : ''} · {money(
					day.spent
				)}{#if day.income}
					· <span class="pos">+{money(day.income)} income</span>{/if}
			</p>
		</div>
		{#if edit}
			<div class="dpactions">
				<button class="btn-ghost" onclick={onadd}>+ Add entry</button>
			</div>
		{/if}
	</div>

	<div class="dpbody scroller">
		{#if day.pays.length}
			<div class="daysec">
				<h4 class="dslabel">Paychecks</h4>
				<PaycheckList paychecks={day.pays} {edit} onedit={oneditPaycheck} showDate={false} />
			</div>
		{/if}

		{#if day.xfers.length}
			<div class="daysec">
				<h4 class="dslabel">Bill pay &amp; transfers</h4>
				<TransferList transfers={day.xfers} {edit} onedit={oneditTransfer} showDate={false} />
			</div>
		{/if}

		{#if txns.length}
			<div class="daysec">
				<h4 class="dslabel">Transactions</h4>
				<TransactionList transactions={txns} {edit} onedit={oneditTransaction} showDate={false} />
			</div>
		{/if}

		{#if empty}
			<Empty
				>No activity this day.{#if edit}&nbsp;Add an entry above.{/if}</Empty
			>
		{/if}
	</div>
</aside>

<style>
	/* Chrome comes from the shared `.card`, so the panel can't drift from the panes beside it. What's
	   local is the sizing, and the direction of control is the point: the CALENDAR decides how tall
	   this row is and the rail fits into it. `flex: 1 1 0` — basis 0, not auto — is what makes that
	   true; with an `auto` basis the panel's own content height still counts toward the column's
	   intrinsic height, so a busy day made the rail the tallest thing in the row, which is the exact
	   behaviour this is meant to prevent. */
	.side {
		display: flex;
		flex-direction: column;
		flex: 1 1 0;
		min-height: calc(var(--listrow-h) * 3);
		overflow: hidden;
	}
	.dpbody {
		flex: 1 1 0;
		min-height: 0;
		overflow-x: hidden;
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
	/* Stacked (single-column) layout: there is no neighbouring column to match, so the panel can
	   simply run to its content. The CAP has to go with the overflow — leaving a height limit while
	   letting overflow be visible spilled a busy day through the bottom of the card. */
	@media (max-width: 70rem) {
		.side {
			flex: none;
			overflow-y: visible;
		}
		.dpbody {
			flex: none;
			overflow-y: visible;
		}
	}
</style>
