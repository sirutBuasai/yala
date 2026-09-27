<script lang="ts">
	import { accounts, data, refreshData } from '$lib/data/load';
	import Transactions from '$lib/views/transactions/Transactions.svelte';
</script>

{#if $data}
	<Transactions data={$data} accounts={$accounts} onsaved={refreshData} />
{/if}
