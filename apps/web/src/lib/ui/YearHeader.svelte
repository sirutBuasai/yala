<script lang="ts">
	import type { Scalar } from '$lib/data/primitives';
	import ViewHeader from '$lib/ui/ViewHeader.svelte';
	import KpiRow from '$lib/ui/KpiRow.svelte';
	import Chevron from '$lib/ui/Chevron.svelte';
	import Select from '$lib/forms/Select.svelte';

	interface Props {
		title: string;
		years: number[];
		year: number;
		tiles: Scalar[];
	}
	let { title, years, year = $bindable(), tiles }: Props = $props();
</script>

<ViewHeader {title}>
	<div class="yearnav">
		<button class="navbtn" aria-label="Previous year" onclick={() => (year -= 1)}>
			<Chevron dir="left" />
		</button>
		<div class="yearsel">
			<Select
				ariaLabel="Year"
				value={String(year)}
				options={years.map(String)}
				onchange={(v) => (year = Number(v))}
			/>
		</div>
		<button class="navbtn" aria-label="Next year" onclick={() => (year += 1)}>
			<Chevron dir="right" />
		</button>
	</div>
</ViewHeader>

<KpiRow {tiles} />

<style>
	.yearnav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.yearsel {
		width: 110px;
	}
</style>
