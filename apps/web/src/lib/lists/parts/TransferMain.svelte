<script lang="ts">
	// A bill pay row's main cell: the route between accounts, a pending badge, and the payee under it.
	import { formatAccount } from '$lib/utils/format';
	import Badge from '$lib/ui/Badge.svelte';

	interface Props {
		t: { payee: string; pending: boolean; from_account: string; to_account: string };
	}
	let { t }: Props = $props();
</script>

<span class="main">
	<span class="title">
		<span class="route">{formatAccount(t.from_account)} → {formatAccount(t.to_account)}</span>
		{#if t.pending}<Badge tone="warn" dot>pending</Badge>{/if}
	</span>
	{#if t.payee}<span class="note">{t.payee}</span>{/if}
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
	.route {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.note {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink-3);
		font-size: var(--text-badge);
	}
</style>
