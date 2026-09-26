<script lang="ts">
	// A month run up day by day against the month before it and your average, with where it stands today
	// under it. A day opens Transactions' calendar at it (D40).
	import type { MultiSeries } from '$lib/data/primitives';
	import { formatDelta, formatUnit } from '$lib/data/primitives';
	import { MONTH_PARAM } from '$lib/nav/focus';
	import { drillTo } from '$lib/nav/drill';
	import { monthLabel, monthName, ordinal } from '$lib/utils/format';
	import { addMonths } from '$lib/utils/period';
	import { words } from '$lib/ui/label';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';

	interface Props {
		id: string;
		title: string;
		/** What is run up, as the caption names it: "spending", "net income". */
		what: string;
		/** The verb the summary reads with: "spent", "earned". */
		verb: string;
		pace: MultiSeries;
		monthKey: string;
		/** The day the month's own line has reached, "YYYY-MM-DD". */
		through: string;
	}
	let { id, title, what, verb, pace, monthKey, through }: Props = $props();

	const lastMonth = $derived(monthName(addMonths(monthKey, -1)));
	const summary = $derived.by(() => {
		const day = Number(through.slice(8));
		const [now, last] = pace.series.map((s) => s.points[day - 1]?.value ?? 0);
		return `${formatUnit(now!, pace.unit)} ${verb} by the ${ordinal(day)}, ${formatDelta(now! - last!, pace.unit)} against ${lastMonth} at the same day.`;
	});

	function openDay(date: string) {
		const query = new URLSearchParams({ [MONTH_PARAM]: monthKey, day: date });
		void drillTo(`/transactions?${query}`, { pane: 'calendar' });
	}
</script>

<Pane
	{id}
	title={words(title)}
	caption={{
		context: monthLabel(monthKey),
		text: `${what} to date against ${lastMonth} and your average`
	}}
>
	<Figure primitive={pace} chart="line" area dashed={['Last month']} onpick={openDay} />
	<p class="cap">{summary}</p>
</Pane>
