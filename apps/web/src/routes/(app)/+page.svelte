<script lang="ts">
	import { data } from '$lib/data/load';
	import Dashboard from '$lib/views/dashboard/Dashboard.svelte';
</script>

{#if $data}
	<Dashboard data={$data} />
{/if}
