<script lang="ts">
	import { accounts, data, refreshData } from '$lib/data/load';
	import ManageView from '$lib/views/manage/Manage.svelte';
</script>

{#if $data}
	<ManageView data={$data} accounts={$accounts} onsaved={refreshData} />
{/if}
