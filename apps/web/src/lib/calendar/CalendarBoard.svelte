<script lang="ts">
	// The calendar board: a month grid beside the selected day's entries. This file owns only the
	// wiring — which day is selected, and the Add/Edit overlays the day panel opens. The grid draws
	// itself (CalendarGrid), the rail draws itself (DayPanel), and the month arithmetic is pure
	// (days.ts), so each of the three can be read, changed or tested without the other two.
	import type { Snippet } from 'svelte';
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import {
		dayCells,
		daysInMonthOf,
		dayOf,
		firstWeekdayOf,
		latestActivityDay,
		weekRows
	} from '$lib/calendar/days';
	import { MONTHS } from '$lib/utils/format';
	import { matching, Pref } from '$lib/utils/persist.svelte';
	import CalendarGrid from '$lib/calendar/CalendarGrid.svelte';
	import DayPanel from '$lib/calendar/DayPanel.svelte';
	import EditModals from '$lib/entries/EditModals.svelte';
	import Pane from '$lib/ui/Pane.svelte';
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
	}
	let { data, edit, accounts, onsaved, monthKey, railBelow }: Props = $props();

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

	let modals: ReturnType<typeof EditModals>;
</script>

<Split stretch>
	{#snippet main()}
		<!-- A size-container, so the grid inside reacts to the PANE's width rather than the viewport's:
		     this board is full-width on Home but sits in a Split column, and only the container knows. -->
		<div class="calpane">
			<Pane title="Log activity">
				<CalendarGrid {rows} {monthKey} {firstWeekday} {selectedDay} onpick={pickDay} />
			</Pane>
		</div>
	{/snippet}

	{#snippet rail()}
		{#if selected}
			<DayPanel
				day={selected}
				{month}
				{year}
				{edit}
				onadd={() => modals.add()}
				oneditTransaction={(l) => modals.editTransaction(l)}
				oneditPaycheck={(l) => modals.editPaycheck(l)}
				oneditTransfer={(l) => modals.editTransfer(l)}
			/>
		{/if}
		{@render railBelow?.()}
	{/snippet}
</Split>

<EditModals
	bind:this={modals}
	{accounts}
	{onsaved}
	kinds={['transaction', 'paycheck', 'transfer']}
	presetDate={selected?.iso}
	addTitle={selected ? `Add entry · ${MONTHS[month - 1]} ${selected.day}` : 'Add entry'}
/>

<style>
	.calpane {
		container-type: inline-size;
	}
</style>
