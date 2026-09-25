<script lang="ts">
	import { data } from '$lib/data/load';
	import Analytics from '$lib/views/analytics/Analytics.svelte';
</script>

{#if $data}
	<Analytics data={$data} />
{/if}
