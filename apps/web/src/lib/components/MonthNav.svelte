<script lang="ts">
	// Month period stepper: prev/next arrows around a month + year picker. Controlled — the
	// parent owns the value and applies changes via `onchange`. Shared by the Monthly and
	// Calendar views.
	import Select from './Select.svelte';
	import { addMonths, monthName, monthForYear, pickableMonths } from '$lib/period';

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

<div class="monthnav">
	<button class="navbtn" aria-label="Previous month" onclick={() => onchange(addMonths(value, -1))}
		>‹</button
	>
	<div class="selectors">
		<div class="monthsel">
			<Select ariaLabel="Month" {value} options={monthsInYear} optionLabel={monthName} {onchange} />
		</div>
		<div class="yearsel">
			<Select
				ariaLabel="Year"
				value={selYear}
				options={years}
				onchange={(y) => onchange(monthForYear(pickable, y, value))}
			/>
		</div>
	</div>
	<button class="navbtn" aria-label="Next month" onclick={() => onchange(addMonths(value, 1))}
		>›</button
	>
</div>

<style>
	.monthnav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.selectors {
		display: flex;
		gap: 8px;
	}
	.monthsel {
		width: 130px;
	}
	.yearsel {
		width: 100px;
	}
</style>
