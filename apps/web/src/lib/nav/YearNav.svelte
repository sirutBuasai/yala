<script lang="ts">
	// Year period stepper: prev/next arrows around a year picker. Controlled — the parent owns
	// the value and applies changes via `onchange`. Sibling of MonthNav for year-based views.
	import Select from '$lib/forms/Select.svelte';
	import RangeNav from '$lib/nav/RangeNav.svelte';

	interface Props {
		/** Current year. */
		value: number;
		/** Selectable years (drives the picker options). */
		years: number[];
		onchange: (year: number) => void;
	}
	let { value, years, onchange }: Props = $props();
</script>

<RangeNav
	prevLabel="Previous year"
	nextLabel="Next year"
	onprev={() => onchange(value - 1)}
	onnext={() => onchange(value + 1)}
>
	<div class="yearsel">
		<Select
			ariaLabel="Year"
			value={String(value)}
			options={years.map(String)}
			onchange={(v) => onchange(Number(v))}
		/>
	</div>
</RangeNav>

<style>
	.yearsel {
		width: 110px;
	}
</style>
