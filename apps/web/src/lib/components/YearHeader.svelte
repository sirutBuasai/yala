<script lang="ts">
	import type { KpiTile } from '$lib/kpis';
	import Kpi from './Kpi.svelte';
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
	<div class="yearsel">
		<Select
			ariaLabel="Year"
			value={String(year)}
			options={years.map(String)}
			onchange={(v) => (year = Number(v))}
		/>
	</div>
</div>

<div class="kpis">
	{#each tiles as t (t.label)}
		<Kpi label={t.label} value={t.value} delta={t.delta} dir={t.dir} foot={t.foot} />
	{/each}
</div>

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
	.yearsel {
		width: 110px;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		margin-bottom: 18px;
	}
	@media (max-width: 900px) {
		.kpis {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
