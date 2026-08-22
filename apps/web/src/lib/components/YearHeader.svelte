<script lang="ts">
	import type { KpiTile } from '$lib/kpis';
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

<div class="yhead">
	<h2 class="serif">{title}</h2>
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
</div>

<KpiRow {tiles} />

<style>
	.yhead {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
	}
	.yhead h2 {
		font-size: 22px;
		font-weight: 600;
		margin: 0;
	}
	.yearnav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.yearsel {
		width: 110px;
	}
</style>
