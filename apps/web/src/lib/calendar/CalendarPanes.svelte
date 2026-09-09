<script lang="ts">
	// The calendar and the selected day, as two panes on the board. This file owns only the wiring —
	// which day is selected — so the grid draws itself (CalendarGrid), the entries draw themselves
	// (DayEntries), and the month arithmetic stays pure (days.ts).
	//
	// It renders TWO cells at its root and no wrapper. That matters: a grid item must be a direct child
	// of its grid, and a Svelte component adds no element of its own, so both cells land straight in
	// the board and can be placed and moved independently — which is the whole point of the grid. Its
	// predecessor wrapped them in a two-column `Split`, and that pairing was fixed in code.
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
	import { matching, Pref } from '$lib/utils/persist.svelte';
	import Cell from '$lib/layout/grid/Cell.svelte';
	import CalendarGrid from '$lib/calendar/CalendarGrid.svelte';
	import DayEntries from '$lib/calendar/DayEntries.svelte';

	interface Props {
		data: DashboardData;
		/** The month on screen, "YYYY-MM" — controlled by the parent so the scope can be shared. */
		monthKey: string;
		onadd: (iso: string) => void;
		oneditTransaction: (locator: string) => void;
		oneditPaycheck: (locator: string) => void;
		oneditTransfer: (locator: string) => void;
	}
	let { data, monthKey, onadd, oneditTransaction, oneditPaycheck, oneditTransfer }: Props =
		$props();

	const year = $derived(+monthKey.slice(0, 4));
	const month = $derived(+monthKey.slice(5, 7));
	const firstWeekday = $derived(firstWeekdayOf(monthKey));
	const cells = $derived(monthKey ? dayCells(data, monthKey) : []);
	const rows = $derived(weekRows(cells, firstWeekday));

	// The selected day is remembered as a full ISO date, never a bare day number: a stored 17 would
	// silently re-apply itself to whatever month you stepped to, which is not "the day I chose".
	const chosen = new Pref('calendar-day', '', matching(/^\d{4}-\d{2}-\d{2}$/));

	let selectedDay = $state<number | null>(null);
	// The month a selection was last made for. Without it the first render — which runs before the
	// parent has resolved a month — would settle on the 1st and then look "already chosen", so the
	// real month's latest activity never got picked.
	let pickedFor = $state('');

	// Resolve the day whenever the month changes: a remembered date wins when it belongs to THIS
	// month (so a refresh, or a trip through another tab, returns you to the day you were on), and
	// otherwise the month opens on its most recent activity. Either way a deliberate choice stands
	// until the month actually changes.
	$effect(() => {
		if (!monthKey) return;
		const dim = daysInMonthOf(monthKey);
		if (pickedFor === monthKey && selectedDay != null && selectedDay <= dim) return;

		const remembered = chosen.value.startsWith(`${monthKey}-`) ? dayOf(chosen.value) : 0;
		selectedDay = Math.min(remembered || latestActivityDay(cells) || 1, dim);
		pickedFor = monthKey;
	});

	/** Select a day and remember it, so it survives a refresh or a switch between tabs. */
	function pickDay(day: number) {
		selectedDay = day;
		pickedFor = monthKey;
		chosen.value = `${monthKey}-${String(day).padStart(2, '0')}`;
	}

	const selected = $derived(selectedDay ? cells[selectedDay - 1] : undefined);
	const dayTitle = $derived(
		selected ? `${MONTHS[month - 1]} ${selected.day}, ${year}` : 'No day selected'
	);
	/** The day's totals, as the pane's subtitle rather than a header of its own. */
	const dayCap = $derived.by(() => {
		if (!selected) return '';
		const plural = selected.txns.length === 1 ? '' : 's';
		const income = selected.income ? ` · +${money(selected.income)} income` : '';
		return `${selected.txns.length} transaction${plural} · ${money(selected.spent)}${income}`;
	});
</script>

<Cell id="calendar" title="Log activity" cap={`${MONTHS[month - 1]} ${year} · pick a day`}>
	<!-- A size-container, so the grid inside reacts to the PANE's width rather than the viewport's:
	     this pane can be anything from a third of the board to all of it. -->
	<div class="calpane">
		<CalendarGrid {rows} {monthKey} {firstWeekday} {selectedDay} onpick={pickDay} />
	</div>
</Cell>

<Cell id="day" title={dayTitle} cap={dayCap}>
	{#snippet actions()}
		{#if selected}
			<button class="btn-ghost" onclick={() => onadd(selected.iso)}>+ Add entry</button>
		{/if}
	{/snippet}
	{#if selected}
		<DayEntries day={selected} {oneditTransaction} {oneditPaycheck} {oneditTransfer} />
	{/if}
</Cell>

<style>
	.calpane {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
	}
</style>
