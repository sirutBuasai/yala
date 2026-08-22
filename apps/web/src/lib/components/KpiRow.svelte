<script lang="ts">
	// The per-tab KPI grid: a responsive row of Kpi tiles. Shared by Overview / Yearly /
	// Monthly headers so the grid, gaps, and mobile breakpoint live in one place.
	import type { KpiTile } from '$lib/kpis';
	import Kpi from './Kpi.svelte';

	interface Props {
		tiles: KpiTile[];
		/** Columns on wide screens (collapses to 2 under 900px). */
		cols?: number;
	}
	let { tiles, cols = 4 }: Props = $props();
</script>

<div class="kpis" style:--kpi-cols={cols}>
	{#each tiles as t (t.label)}
		<Kpi label={t.label} value={t.value} delta={t.delta} dir={t.dir} foot={t.foot} />
	{/each}
</div>

<style>
	.kpis {
		display: grid;
		grid-template-columns: repeat(var(--kpi-cols), 1fr);
		gap: 14px;
		margin-bottom: 18px;
	}
	@media (max-width: 900px) {
		.kpis {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
