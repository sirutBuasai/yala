<script lang="ts">
	// The month grid: a weekday header, seven columns of day cells, and a gutter carrying each week's
	// spend. Owns the ARIA grid semantics and arrow-key movement; it does NOT own which day is
	// selected — the board above does, so the day panel and the grid always agree.
	import { dayForKey, type WeekRow } from '$lib/calendar/days';
	import { money, moneyCompact, MONTHS } from '$lib/utils/format';
	import DayCellButton from '$lib/calendar/DayCellButton.svelte';
	import WeekTotal from '$lib/calendar/WeekTotal.svelte';

	interface Props {
		rows: WeekRow[];
		/** "YYYY-MM" — needed to clamp keyboard movement to the month's real length. */
		monthKey: string;
		firstWeekday: number;
		selectedDay: number | null;
		onpick: (day: number) => void;
	}
	let { rows, monthKey, firstWeekday, selectedDay, onpick }: Props = $props();

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const year = $derived(+monthKey.slice(0, 4));
	const month = $derived(+monthKey.slice(5, 7));
	// Weeks are scaled against the busiest one, so the gutter reads as a chart of the month.
	const peak = $derived(Math.max(...rows.map((r) => r.total), 1));

	let gridEl = $state<HTMLDivElement>();

	// Roving tabindex: a month is 28–31 cells, and as plain buttons that was 31 tab stops to cross
	// before reaching anything else. Only the selected cell is tabbable; arrows do the rest. Selection
	// follows focus, since the day panel beside the grid IS the detail view for the focused cell.
	function onkeydown(e: KeyboardEvent) {
		const next = dayForKey(e.key, selectedDay ?? 1, monthKey, firstWeekday);
		if (next === null) return;
		e.preventDefault();
		onpick(next);
		gridEl?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
	}
</script>

<div class="cal-head">
	<!-- Both spellings are rendered and CSS picks one, so a ~30px column shows "S" where a wide one
	     shows "Sun" — three letters don't fit seven columns on a phone. -->
	{#each WEEKDAYS as w (w)}
		<span><span class="wdlong">{w}</span><span class="wdshort">{w[0]}</span></span>
	{/each}
	<span class="wkhd">Week</span>
</div>

<!-- Real rows, so this is a valid ARIA grid; `display: contents` on each keeps the single CSS grid
     (seven day columns plus the week gutter) that lets every cell share one ruler. -->
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
				{row.total ? moneyCompact(row.total) : '—'}
			</WeekTotal>
		</div>
	{/each}
</div>

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
	/* Wide is the default; the narrow container query below swaps which one shows. */
	.wdshort {
		display: none;
	}
	.cal {
		--sel: var(--lav);
		--pend: var(--gold);
		/* One month needs five week rows, the next needs six. Floor the grid at six rows' worth and let
		   `1fr` rows share whatever that leaves: a five-row month gets slightly taller cells instead of
		   a blank sixth week, and the board is the same height either way. That constant height is what
		   lets the rail beside it — and everything below — stay put as you step through months. */
		--cal-cell-h: 5.5rem;
		grid-auto-rows: minmax(var(--cal-cell-h), 1fr);
		min-height: calc(6 * var(--cal-cell-h) + 5 * var(--gap-row));
	}
	:global(:root[data-theme='light']) .cal {
		--sel: var(--gold);
		--pend: var(--lav);
	}
	/* The week rows exist for ARIA, not for layout: `display: contents` hands their cells straight
	   to `.cal`'s grid, so all seven columns and the gutter stay on one shared ruler. */
	.calrow {
		display: contents;
	}
	.cell.blank {
		background: none;
		border: 0;
		cursor: default;
		min-height: 0;
	}

	/* Seven days must always fit — a calendar with a dropped column isn't a calendar — so the WEEK
	   total is what gives way first. It's a secondary reading, and the day cells need every pixel
	   before their contents stop being legible. Container-, not viewport-scoped: this grid is
	   full-width on Home but sits inside a Split's main column, so the pane's width is what matters. */
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
