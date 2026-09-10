<script lang="ts">
	// Every KPI card on the board, one per group. A view renders this rather than walking the groups
	// itself: which cards exist is the grouping's business, and merging changes it under the view.
	import type { DashboardData } from '$lib/data/types';
	import { getKpiBoard } from './context';
	import KpiPane from './KpiPane.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const kpis = getKpiBoard();
</script>

{#each kpis.groups as group (group.ids[0])}
	<KpiPane id={group.ids[0]!} {data} />
{/each}
