<script lang="ts">
	import { accounts, data, refreshData } from '$lib/data/load';
	import Accounts from '$lib/views/accounts/Accounts.svelte';
</script>

{#if $data}
	<Accounts data={$data} accounts={$accounts} onsaved={refreshData} />
{/if}
