<script lang="ts">
	// Year period stepper. Controlled: the parent owns the value and applies changes via `onchange`.
	import Select from '$lib/forms/fields/Select.svelte';
	import RangeNav from '$lib/nav/RangeNav.svelte';

	interface Props {
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
