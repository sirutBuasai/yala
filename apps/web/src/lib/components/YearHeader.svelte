<script lang="ts">
	import type { KpiTile } from '$lib/kpis';
	import ViewHeader from './ViewHeader.svelte';
	import KpiRow from './KpiRow.svelte';
	import Select from './Select.svelte';

	interface Props {
		title: string;
		years: number[];
		year: number;
		tiles: KpiTile[];
	}
	let { title, years, year = $bindable(), tiles }: Props = $props();
</script>

<ViewHeader {title}>
	<div class="yearnav">
		<button class="navbtn" aria-label="Previous year" onclick={() => (year -= 1)}>‹</button>
		<div class="yearsel">
			<Select
				ariaLabel="Year"
				value={String(year)}
				options={years.map(String)}
				onchange={(v) => (year = Number(v))}
			/>
		</div>
		<button class="navbtn" aria-label="Next year" onclick={() => (year += 1)}>›</button>
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
