<script lang="ts">
	// Month period stepper. Controlled: the parent owns the value and applies changes via `onchange`.
	import Select from '$lib/forms/fields/Select.svelte';
	import RangeNav from '$lib/nav/RangeNav.svelte';
	import { monthName } from '$lib/utils/format';
	import { addMonths, monthForYear, pickableMonths } from '$lib/utils/period';

	interface Props {
		/** Current month key, "YYYY-MM". */
		value: string;
		/** Month keys that carry data (drives the picker options). */
		monthKeys: string[];
		onchange: (key: string) => void;
	}
	let { value, monthKeys, onchange }: Props = $props();

	const pickable = $derived(pickableMonths(monthKeys, value));
	const years = $derived([...new Set(pickable.map((k) => k.slice(0, 4)))].sort().reverse());
	const selYear = $derived(value.slice(0, 4));
	const monthsInYear = $derived(pickable.filter((k) => k.startsWith(selYear + '-')));
</script>

<RangeNav
	prevLabel="Previous month"
	nextLabel="Next month"
	onprev={() => onchange(addMonths(value, -1))}
	onnext={() => onchange(addMonths(value, 1))}
>
	<div class="selectors">
		<div class="periodsel">
			<Select ariaLabel="Month" {value} options={monthsInYear} optionLabel={monthName} {onchange} />
		</div>
		<div class="periodsel year">
			<Select
				ariaLabel="Year"
				value={selYear}
				options={years}
				onchange={(y) => onchange(monthForYear(pickable, y, value))}
			/>
		</div>
	</div>
</RangeNav>

<style>
	/* Bug: wide fixed slots overflowed a narrow screen once the arrows and gaps were counted, so the
	   pair wraps onto a second line rather than pushing the header past the page. */
	.selectors {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-row);
		min-width: 0;
	}
</style>
