<script lang="ts">
	// A transaction row's main cell: the payee, a pending badge, and the category under it.
	import Badge from '$lib/ui/Badge.svelte';

	let { t }: { t: { payee: string; pending: boolean; category: string } } = $props();
</script>

<span class="main">
	<span class="title">
		<span class="payee">{t.payee}</span>
		{#if t.pending}<Badge tone="warn" dot>pending</Badge>{/if}
	</span>
	<span class="cat">{t.category}</span>
</span>

<style>
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
		font-size: var(--text-row);
		font-weight: var(--fw-medium);
	}
	.payee {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.cat {
		color: var(--ink-3);
		font-size: var(--text-badge);
	}
</style>
