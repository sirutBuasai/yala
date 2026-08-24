<script lang="ts">
	// Month period stepper: prev/next arrows around a month + year picker. Controlled — the
	// parent owns the value and applies changes via `onchange`. Shared by the Monthly and
	// Calendar views.
	import Select from '$lib/forms/Select.svelte';
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

<div class="monthnav">
	<button class="navbtn" aria-label="Previous month" onclick={() => onchange(addMonths(value, -1))}>
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="M10 3.5 5.5 8 10 12.5"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
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
	<button class="navbtn" aria-label="Next month" onclick={() => onchange(addMonths(value, 1))}>
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="M6 3.5 10.5 8 6 12.5"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
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
