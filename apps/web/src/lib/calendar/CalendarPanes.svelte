<script lang="ts">
	// The calendar and the selected day as two panes on the board. The chosen day is the caller's, since
	// it lives in the URL; with none chosen in this month, the month's latest activity shows. Two cells at its root and no wrapper: a grid item must be a direct child of its grid, so
	// wrapping them would pin the pair together.
	import type { DashboardData } from '$lib/data/types';
	import {
		dayCells,
		daysInMonthOf,
		dayOf,
		firstWeekdayOf,
		latestActivityDay,
		weekRows
	} from '$lib/calendar/days';
	import { money, MONTHS } from '$lib/utils/format';
	import { isoDate, monthOf, yearOf } from '$lib/utils/period';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import CalendarGrid from '$lib/calendar/CalendarGrid.svelte';
	import DayEntries from '$lib/calendar/DayEntries.svelte';
	import { live, words } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
		/** The month on screen, "YYYY-MM" — controlled by the parent so the scope can be shared. */
		monthKey: string;
		/** The chosen day, "YYYY-MM-DD", or '' for none. A day outside `monthKey` counts as none. */
		day: string;
		onpick: (iso: string) => void;
		onadd: (iso: string) => void;
		oneditTransaction: (locator: string) => void;
		oneditPaycheck: (locator: string) => void;
		oneditTransfer: (locator: string) => void;
	}
	let {
		data,
		monthKey,
		day,
		onpick,
		onadd,
		oneditTransaction,
		oneditPaycheck,
		oneditTransfer
	}: Props = $props();

	const year = $derived(yearOf(monthKey));
	const month = $derived(monthOf(monthKey));
	const firstWeekday = $derived(firstWeekdayOf(monthKey));
	const cells = $derived(monthKey ? dayCells(data, monthKey) : []);
	const rows = $derived(weekRows(cells, firstWeekday));

	// A full ISO date, never a bare day number: a bare day would re-apply itself to whatever month you
	// stepped to.
	const selectedDay = $derived.by(() => {
		if (!monthKey) return null;
		const chosen = day.startsWith(`${monthKey}-`) ? dayOf(day) : 0;
		return Math.min(chosen || latestActivityDay(cells) || 1, daysInMonthOf(monthKey));
	});

	const pickDay = (d: number) => onpick(isoDate(monthKey, d));

	const selected = $derived(selectedDay ? cells[selectedDay - 1] : undefined);
	const dayTitle = $derived(
		selected ? `${MONTHS[month - 1]} ${selected.day}, ${year}` : 'No day selected'
	);
	const dayCaption = $derived.by(() => {
		if (!selected) return '';
		const plural = selected.txns.length === 1 ? '' : 's';
		const income = selected.income ? ` · +${money(selected.income)} income` : '';
		return `${selected.txns.length} transaction${plural} · ${money(selected.spent)}${income}`;
	});
</script>

<Pane id="calendar" title={words('Log activity')} caption={live(`${MONTHS[month - 1]} ${year}`)}>
	<!-- A size-container, so the grid inside reacts to the PANE's width rather than the viewport's. -->
	<div class="calpane">
		<CalendarGrid {rows} {monthKey} {firstWeekday} {selectedDay} onpick={pickDay} />
	</div>
</Pane>

<Pane id="day" title={live(dayTitle)} caption={live(dayCaption)}>
	{#snippet actions()}
		{#if selected}
			<button class="btn-ghost" onclick={() => onadd(selected.iso)}>+ Add</button>
		{/if}
	{/snippet}
	{#if selected}
		<DayEntries day={selected} {oneditTransaction} {oneditPaycheck} {oneditTransfer} />
	{/if}
</Pane>

<style>
	.calpane {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
	}
</style>
