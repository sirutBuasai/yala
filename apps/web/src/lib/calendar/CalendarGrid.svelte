<script lang="ts">
	// Owns the ARIA grid semantics and arrow-key movement, but NOT which day is selected — the board
	// above does, so the day panel and the grid always agree.
	import { NO_VALUE } from '$lib/copy';
	import { dayForKey, type WeekRow } from '$lib/calendar/days';
	import { money, moneyCompact, MONTHS } from '$lib/utils/format';
	import { monthOf, yearOf } from '$lib/utils/period';
	import DayCellButton from '$lib/calendar/DayCellButton.svelte';
	import WeekTotal from '$lib/calendar/WeekTotal.svelte';

	interface Props {
		rows: WeekRow[];
		/** "YYYY-MM" — clamps keyboard movement to the month's real length. */
		monthKey: string;
		firstWeekday: number;
		selectedDay: number | null;
		onpick: (day: number) => void;
	}
	let { rows, monthKey, firstWeekday, selectedDay, onpick }: Props = $props();

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const year = $derived(yearOf(monthKey));
	const month = $derived(monthOf(monthKey));
	// Weeks are scaled against the busiest one, so the gutter reads as a chart of the month.
	const peak = $derived(Math.max(...rows.map((r) => r.total), 1));

	let gridEl = $state<HTMLDivElement>();

	// Roving tabindex, so the whole month is one tab stop. Selection follows focus, since the day panel
	// beside the grid IS the detail view for the focused cell.
	function onkeydown(e: KeyboardEvent) {
		const next = dayForKey(e.key, selectedDay ?? 1, monthKey, firstWeekday);
		if (next === null) return;
		e.preventDefault();
		onpick(next);
		gridEl?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
	}
</script>

<div class="cal-head">
	<!-- Both spellings are rendered and CSS picks one, since three letters don't fit seven narrow columns. -->
	{#each WEEKDAYS as w (w)}
		<span><span class="wdlong">{w}</span><span class="wdshort">{w[0]}</span></span>
	{/each}
	<span class="wkhd">Week</span>
</div>

<!-- Real rows, so this is a valid ARIA grid; `display: contents` on each still hands their cells to
     `.cal`'s grid, so every column shares one ruler. -->
<div
	class="cal"
	role="grid"
	aria-label={`${MONTHS[month - 1]} ${year} activity by day`}
	tabindex="-1"
	bind:this={gridEl}
	{onkeydown}
>
	{#each rows as row, ri (ri)}
		<div class="calrow" role="row">
			{#each row.cells as cell, ci (ci)}
				{#if cell}
					<DayCellButton {cell} {month} selected={selectedDay === cell.day} {onpick} />
				{:else}
					<div class="cell blank" role="gridcell"></div>
				{/if}
			{/each}
			<WeekTotal total={row.total} {peak} label={`Week total ${money(row.total)}`}>
				{row.total ? moneyCompact(row.total) : NO_VALUE}
			</WeekTotal>
		</div>
	{/each}
</div>

<style>
	.cal-head,
	.cal {
		--wk-gutter: 3.25rem;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr)) var(--wk-gutter);
		gap: var(--gap-row);
	}
	.cal-head {
		/* Pane's title margin alone is too tight above the weekday row. */
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
	.wdshort {
		display: none;
	}
	.cal {
		/* Grow into the pane's height so the `1fr` rows share it, rather than leaving empty space under
		   the last week. */
		flex: 1 1 auto;
		--sel: var(--lav);
		--pend: var(--gold);
		/* Floored at the tallest a month can be, so a shorter month gets taller cells rather than a
		   blank trailing week. The constant height is what keeps the rest of the board still as you step
		   through months. */
		--cal-cell-h: 5.5rem;
		grid-auto-rows: minmax(var(--cal-cell-h), 1fr);
		min-height: calc(6 * var(--cal-cell-h) + 5 * var(--gap-row));
	}
	:global(:root[data-theme='light']) .cal {
		--sel: var(--gold);
		--pend: var(--lav);
	}
	.calrow {
		display: contents;
	}
	.cell.blank {
		background: none;
		border: 0;
		cursor: default;
		min-height: 0;
	}

	/* Seven days must always fit, so the week gutter is what gives way first. Container-scoped, not
	   viewport-scoped: the PANE's width is what this grid has to fit into. */
	@container (max-width: 30rem) {
		.cal-head,
		.cal {
			gap: var(--space-2);
			grid-template-columns: repeat(7, minmax(0, 1fr));
		}
		.cal {
			--cal-cell-h: 3.5rem;
		}
		.cal-head .wkhd,
		.wdlong {
			display: none;
		}
		.wdshort {
			display: inline;
		}
	}
</style>
