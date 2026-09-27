<script lang="ts">
	import { data, refreshData } from '$lib/data/load';
	import Planning from '$lib/views/planning/Planning.svelte';
</script>

{#if $data}
	<Planning data={$data} onsaved={refreshData} />
{/if}
